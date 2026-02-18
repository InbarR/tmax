import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  TerminalId,
  LayoutNode,
  LayoutSplitNode,
  LayoutLeafNode,
  LayoutState,
  FloatingPanelState,
  TerminalInstance,
  AppConfig,
  SplitDirection,
} from './types';

// ── Theme → CSS variable sync ────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function adjustBrightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(rgb.r + amount), clamp(rgb.g + amount), clamp(rgb.b + amount)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

export function applyThemeToChromeVars(theme: Record<string, string>): void {
  const bg = theme.background || '#1e1e2e';
  const fg = theme.foreground || '#cdd6f4';
  const isLight = luminance(bg) > 0.5;
  const step = isLight ? -15 : 15;

  const root = document.documentElement;
  root.style.setProperty('--bg-primary', bg);
  root.style.setProperty('--bg-secondary', adjustBrightness(bg, step));
  root.style.setProperty('--border-color', adjustBrightness(bg, step * 2));
  root.style.setProperty('--tab-bg', adjustBrightness(bg, step));
  root.style.setProperty('--tab-active', adjustBrightness(bg, step * 2));
  root.style.setProperty('--text-primary', fg);
  root.style.setProperty('--text-secondary', adjustBrightness(fg, isLight ? 60 : -60));
  root.style.setProperty('--focus-border', theme.blue || '#89b4fa');
}

// ── Pure tree helper functions ───────────────────────────────────────

/**
 * Remove a leaf from the tree. If the leaf is inside a split, promote its
 * sibling to replace the split node. Returns null if the tree becomes empty.
 */
export function removeLeaf(
  root: LayoutNode,
  terminalId: TerminalId,
): LayoutNode | null {
  if (root.kind === 'leaf') {
    return root.terminalId === terminalId ? null : root;
  }

  const firstResult = removeLeaf(root.first, terminalId);
  const secondResult = removeLeaf(root.second, terminalId);

  // The leaf was not found in either subtree — return unchanged
  if (firstResult === root.first && secondResult === root.second) {
    return root;
  }

  // Leaf was in the first subtree
  if (firstResult === null) return secondResult;
  // Leaf was in the second subtree
  if (secondResult === null) return firstResult;

  // Leaf was removed deeper, but both children still exist
  return { ...root, first: firstResult, second: secondResult };
}

/**
 * Insert a new leaf beside the target leaf. Creates a split node wrapping the
 * existing target and the new terminal.
 */
export function insertLeaf(
  root: LayoutNode,
  targetId: TerminalId,
  newId: TerminalId,
  side: 'left' | 'right' | 'top' | 'bottom',
): LayoutNode {
  if (root.kind === 'leaf') {
    if (root.terminalId !== targetId) return root;

    const direction: SplitDirection =
      side === 'left' || side === 'right' ? 'horizontal' : 'vertical';
    const newLeaf: LayoutLeafNode = { kind: 'leaf', terminalId: newId };
    const isNewFirst = side === 'left' || side === 'top';

    const splitNode: LayoutSplitNode = {
      kind: 'split',
      id: uuidv4(),
      direction,
      splitRatio: 0.5,
      first: isNewFirst ? newLeaf : root,
      second: isNewFirst ? root : newLeaf,
    };
    return splitNode;
  }

  const newFirst = insertLeaf(root.first, targetId, newId, side);
  const newSecond = insertLeaf(root.second, targetId, newId, side);

  if (newFirst === root.first && newSecond === root.second) return root;
  return { ...root, first: newFirst, second: newSecond };
}

/**
 * In-order traversal of the layout tree returning terminal IDs from left to
 * right (first to second).
 */
export function getLeafOrder(root: LayoutNode): TerminalId[] {
  if (root.kind === 'leaf') return [root.terminalId];
  return [...getLeafOrder(root.first), ...getLeafOrder(root.second)];
}

/**
 * Find the path from the root to a specific leaf node. Returns an array of
 * 'first'|'second' steps, or null if not found.
 */
export function findLeafPath(
  root: LayoutNode,
  terminalId: TerminalId,
): ('first' | 'second')[] | null {
  if (root.kind === 'leaf') {
    return root.terminalId === terminalId ? [] : null;
  }

  const firstPath = findLeafPath(root.first, terminalId);
  if (firstPath !== null) return ['first', ...firstPath];

  const secondPath = findLeafPath(root.second, terminalId);
  if (secondPath !== null) return ['second', ...secondPath];

  return null;
}

/**
 * Immutably update the splitRatio of a split node identified by its id.
 * Returns the tree unchanged if the node is not found.
 */
export function updateSplitRatio(
  root: LayoutNode,
  splitNodeId: string,
  ratio: number,
): LayoutNode {
  if (root.kind === 'leaf') return root;

  if (root.id === splitNodeId) {
    return { ...root, splitRatio: Math.max(0.1, Math.min(0.9, ratio)) };
  }

  const newFirst = updateSplitRatio(root.first, splitNodeId, ratio);
  const newSecond = updateSplitRatio(root.second, splitNodeId, ratio);

  if (newFirst === root.first && newSecond === root.second) return root;
  return { ...root, first: newFirst, second: newSecond };
}

/**
 * Swap the terminal IDs of two leaf nodes in the tree.
 */
function swapLeaves(
  root: LayoutNode,
  idA: TerminalId,
  idB: TerminalId,
): LayoutNode {
  if (root.kind === 'leaf') {
    if (root.terminalId === idA) return { ...root, terminalId: idB };
    if (root.terminalId === idB) return { ...root, terminalId: idA };
    return root;
  }

  const newFirst = swapLeaves(root.first, idA, idB);
  const newSecond = swapLeaves(root.second, idA, idB);

  if (newFirst === root.first && newSecond === root.second) return root;
  return { ...root, first: newFirst, second: newSecond };
}

/**
 * Walk the tree to find a directional neighbor of the given terminal.
 * Uses the path-based approach: walk up until we can step in the desired
 * direction, then walk down to the nearest leaf on the opposite edge.
 */
function findDirectionalNeighbor(
  root: LayoutNode,
  terminalId: TerminalId,
  direction: 'left' | 'right' | 'up' | 'down',
): TerminalId | null {
  const path = findLeafPath(root, terminalId);
  if (path === null) return null;

  // Determine which split axis and which step direction we need
  const axis: SplitDirection =
    direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
  const fromSide: 'first' | 'second' =
    direction === 'right' || direction === 'down' ? 'first' : 'second';
  const toSide: 'first' | 'second' =
    fromSide === 'first' ? 'second' : 'first';

  // Walk back up the path to find a split node where we can cross
  let node: LayoutNode = root;
  const nodes: LayoutSplitNode[] = [];

  // Collect all split nodes along the path
  for (const step of path) {
    if (node.kind === 'split') {
      nodes.push(node);
      node = node[step];
    }
  }

  // Walk backwards through the path to find a crossable split
  for (let i = path.length - 1; i >= 0; i--) {
    const splitNode = nodes[i];
    if (splitNode.direction === axis && path[i] === fromSide) {
      // We can cross into the toSide subtree
      let target: LayoutNode = splitNode[toSide];
      // Walk down to the nearest leaf on the edge closest to us
      while (target.kind === 'split') {
        if (target.direction === axis) {
          target = target[fromSide];
        } else {
          // Perpendicular split — pick first by convention
          target = target.first;
        }
      }
      return target.terminalId;
    }
  }

  return null;
}

// ── Store interface ──────────────────────────────────────────────────

interface TerminalStore {
  // State
  terminals: Map<TerminalId, TerminalInstance>;
  layout: LayoutState;
  focusedTerminalId: TerminalId | null;
  config: AppConfig | null;
  isDragging: boolean;
  draggedTerminalId: TerminalId | null;
  nextZIndex: number;
  showSwitcher: boolean;
  showShortcuts: boolean;
  showCommandPalette: boolean;
  showSettings: boolean;
  tabBarPosition: 'top' | 'left';
  renamingTerminalId: TerminalId | null;
  focusModeTerminalId: TerminalId | null;
  selectedTerminalIds: Record<TerminalId, true>;
  fontSize: number;
  favoriteDirs: string[];
  recentDirs: string[];
  showDirPicker: boolean;
  tabMenuTerminalId: TerminalId | null;

  // Actions
  loadConfig: () => Promise<void>;
  createTerminal: (shellProfileId?: string) => Promise<void>;
  closeTerminal: (id: TerminalId) => Promise<void>;
  setFocus: (id: TerminalId) => void;
  splitTerminal: (
    targetId: TerminalId,
    direction: SplitDirection,
    newTerminalId?: TerminalId,
    insertSide?: 'left' | 'right' | 'top' | 'bottom',
  ) => Promise<void>;
  setSplitRatio: (splitNodeId: string, ratio: number) => void;
  swapTerminals: (idA: TerminalId, idB: TerminalId) => void;
  reorderTerminals: (draggedId: TerminalId, overId: TerminalId) => void;
  moveToFloat: (id: TerminalId) => void;
  moveToTiling: (id: TerminalId, targetId?: TerminalId, side?: 'left' | 'right' | 'top' | 'bottom') => void;
  moveToDormant: (id: TerminalId) => void;
  wakeFromDormant: (id: TerminalId) => void;
  detachTerminal: (id: TerminalId) => Promise<void>;
  reattachTerminal: (id: TerminalId) => void;
  updateFloatingPanel: (id: TerminalId, partial: Partial<FloatingPanelState>) => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusDirection: (dir: 'left' | 'right' | 'up' | 'down') => void;
  renameTerminal: (id: TerminalId, title: string) => void;
  setTabColor: (id: TerminalId, color: string | undefined) => void;
  setDragging: (isDragging: boolean, terminalId?: TerminalId) => void;
  toggleSwitcher: () => void;
  toggleShortcuts: () => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  updateConfig: (update: Partial<AppConfig>) => Promise<void>;
  toggleTabBarPosition: () => void;
  startRenaming: (id: TerminalId | null) => void;
  toggleFocusMode: (id?: TerminalId) => void;
  toggleSelectTerminal: (id: TerminalId) => void;
  clearSelection: () => void;
  equalizeLayout: () => void;
  moveTerminalDirection: (id: TerminalId, dir: 'up' | 'down' | 'left' | 'right') => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  saveNamedLayout: (name: string) => Promise<void>;
  loadNamedLayout: (name: string) => Promise<boolean>;
  getLayoutNames: () => Promise<{ name: string; count: number }[]>;
  saveSession: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  addFavoriteDir: (dir: string) => void;
  removeFavoriteDir: (dir: string) => void;
  addRecentDir: (dir: string) => void;
  removeRecentDir: (dir: string) => void;
  cdToDir: (dir: string) => void;
  toggleDirPicker: () => void;
  openTabMenu: (id?: TerminalId) => void;
  loadDirs: () => Promise<void>;
  saveDirs: () => Promise<void>;
}

// Cached session extras (layouts, etc.) so saveSession doesn't need async load
let _sessionExtras: Record<string, unknown> = {};

// ── Store implementation ─────────────────────────────────────────────

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────
  terminals: new Map(),
  layout: { tilingRoot: null, floatingPanels: [] },
  focusedTerminalId: null,
  config: null,
  isDragging: false,
  draggedTerminalId: null,
  nextZIndex: 100,
  showSwitcher: false,
  showShortcuts: false,
  showCommandPalette: false,
  showSettings: false,
  showDirPicker: false,
  tabMenuTerminalId: null,
  favoriteDirs: [],
  recentDirs: [],
  tabBarPosition: 'top' as 'top' | 'left',
  renamingTerminalId: null,
  focusModeTerminalId: null,
  selectedTerminalIds: {} as Record<TerminalId, true>,
  fontSize: 14,

  // ── Actions ──────────────────────────────────────────────────────

  loadConfig: async () => {
    const config = (await window.terminalAPI.getConfig()) as unknown as AppConfig;
    if (config?.theme) applyThemeToChromeVars(config.theme);
    set({ config });
  },

  createTerminal: async (shellProfileId?: string) => {
    const { config, terminals, layout, nextZIndex } = get();
    if (!config) return;

    const profileId = shellProfileId ?? config.defaultShellId;
    const profile = config.shells.find((s) => s.id === profileId);
    if (!profile) return;

    const id = uuidv4();
    const cwd = profile.cwd || (config as any).defaultCwd || (navigator.platform.startsWith('Win') ? 'C:\\Users' : process.env.HOME || '/');
    const { pid } = await window.terminalAPI.createPty({
      id,
      shellPath: profile.path,
      args: profile.args,
      cwd,
      env: profile.env,
      cols: 80,
      rows: 24,
    });

    const instance: TerminalInstance = {
      id,
      title: profile.name,
      shellProfileId: profileId,
      cwd,
      customTitle: false,
      mode: 'tiled',
      pid,
      lastProcess: '',
      startupCommand: '',
    };

    const newTerminals = new Map(terminals);
    newTerminals.set(id, instance);

    const newLeaf: LayoutLeafNode = { kind: 'leaf', terminalId: id };
    let newRoot: LayoutNode;

    if (layout.tilingRoot === null) {
      newRoot = newLeaf;
    } else {
      // Insert next to the currently focused terminal, or as a right split
      const leafOrder = getLeafOrder(layout.tilingRoot);
      const lastId = leafOrder[leafOrder.length - 1];
      newRoot = insertLeaf(layout.tilingRoot, lastId, id, 'right');
    }

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: newRoot },
      focusedTerminalId: id,
      nextZIndex,
    });
  },

  closeTerminal: async (id: TerminalId) => {
    const { terminals, layout, focusedTerminalId } = get();
    const instance = terminals.get(id);
    if (!instance) return;

    if (instance.mode === 'detached') {
      await window.terminalAPI.closeDetached(id);
    }
    await window.terminalAPI.killPty(id);

    const newTerminals = new Map(terminals);
    newTerminals.delete(id);

    let newRoot = layout.tilingRoot;
    let newFloating = layout.floatingPanels;

    if (instance.mode === 'tiled' && newRoot) {
      newRoot = removeLeaf(newRoot, id);
    } else if (instance.mode === 'floating') {
      newFloating = newFloating.filter((p) => p.terminalId !== id);
    }

    // Determine new focus
    let newFocus: TerminalId | null = focusedTerminalId;
    if (focusedTerminalId === id) {
      if (newRoot) {
        const order = getLeafOrder(newRoot);
        newFocus = order.length > 0 ? order[0] : null;
      } else if (newFloating.length > 0) {
        newFocus = newFloating[newFloating.length - 1].terminalId;
      } else {
        newFocus = null;
      }
    }

    const newFocusMode = get().focusModeTerminalId === id ? null : get().focusModeTerminalId;

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: newFocus,
      focusModeTerminalId: newFocusMode,
    });
  },

  setFocus: (id: TerminalId) => {
    const { terminals, layout, nextZIndex, focusModeTerminalId } = get();
    if (!terminals.has(id)) return;

    const instance = terminals.get(id)!;
    if (instance.mode === 'dormant') {
      // Just select the tab, don't wake — use context menu "Wake" to restore
      set({ focusedTerminalId: id });
      return;
    }
    if (instance.mode === 'detached') {
      // Select the tab and focus the detached window
      set({ focusedTerminalId: id });
      window.terminalAPI.focusDetached(id);
      return;
    }
    if (instance.mode === 'floating') {
      const newFloating = layout.floatingPanels.map((p) =>
        p.terminalId === id ? { ...p, zIndex: nextZIndex } : p,
      );
      set({
        focusedTerminalId: id,
        layout: { ...layout, floatingPanels: newFloating },
        nextZIndex: nextZIndex + 1,
      });
    } else if (focusModeTerminalId && instance.mode === 'tiled' && id !== focusModeTerminalId) {
      // Exit focus mode when switching to a different tiled terminal
      set({ focusedTerminalId: id, focusModeTerminalId: null });
    } else {
      set({ focusedTerminalId: id });
    }
  },

  splitTerminal: async (
    targetId: TerminalId,
    direction: SplitDirection,
    newTerminalId?: TerminalId,
    insertSide?: 'left' | 'right' | 'top' | 'bottom',
  ) => {
    const { config, terminals, layout } = get();
    if (!config || !layout.tilingRoot) return;

    const targetInstance = terminals.get(targetId);
    if (!targetInstance) return;

    const id = newTerminalId ?? uuidv4();
    const profile = config.shells.find(
      (s) => s.id === targetInstance.shellProfileId,
    );
    if (!profile) return;

    const { pid } = await window.terminalAPI.createPty({
      id,
      shellPath: profile.path,
      args: profile.args,
      cwd: targetInstance.cwd,
      env: profile.env,
      cols: 80,
      rows: 24,
    });

    const instance: TerminalInstance = {
      id,
      title: profile.name,
      shellProfileId: targetInstance.shellProfileId,
      cwd: targetInstance.cwd,
      customTitle: false,
      mode: 'tiled',
      pid,
      lastProcess: '',
      startupCommand: '',
    };

    const side = insertSide ?? (direction === 'horizontal' ? 'right' : 'bottom');
    const newRoot = insertLeaf(layout.tilingRoot, targetId, id, side);

    const newTerminals = new Map(terminals);
    newTerminals.set(id, instance);

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: newRoot },
      focusedTerminalId: id,
    });
  },

  setSplitRatio: (splitNodeId: string, ratio: number) => {
    const { layout } = get();
    if (!layout.tilingRoot) return;
    const newRoot = updateSplitRatio(layout.tilingRoot, splitNodeId, ratio);
    set({ layout: { ...layout, tilingRoot: newRoot } });
  },

  swapTerminals: (idA: TerminalId, idB: TerminalId) => {
    const { layout } = get();
    if (!layout.tilingRoot) return;
    const newRoot = swapLeaves(layout.tilingRoot, idA, idB);
    set({ layout: { ...layout, tilingRoot: newRoot } });
  },

  reorderTerminals: (draggedId: TerminalId, overId: TerminalId) => {
    if (draggedId === overId) return;
    const { terminals, layout } = get();
    const entries = Array.from(terminals.entries());
    const fromIndex = entries.findIndex(([id]) => id === draggedId);
    const toIndex = entries.findIndex(([id]) => id === overId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, moved);

    // Reassign leaf positions so pane order matches new tab order
    let newRoot = layout.tilingRoot;
    if (newRoot) {
      const currentLeafSet = new Set(getLeafOrder(newRoot));
      const newTiledOrder = entries
        .filter(([id]) => currentLeafSet.has(id))
        .map(([id]) => id);

      let leafIdx = 0;
      function reassignLeaves(node: LayoutNode): LayoutNode {
        if (node.kind === 'leaf') {
          const newId = newTiledOrder[leafIdx++];
          return newId === node.terminalId ? node : { ...node, terminalId: newId };
        }
        const newFirst = reassignLeaves(node.first);
        const newSecond = reassignLeaves(node.second);
        if (newFirst === node.first && newSecond === node.second) return node;
        return { ...node, first: newFirst, second: newSecond };
      }
      newRoot = reassignLeaves(newRoot);
    }

    set({
      terminals: new Map(entries),
      layout: { ...layout, tilingRoot: newRoot },
    });
  },

  moveToFloat: (id: TerminalId) => {
    const { terminals, layout, nextZIndex } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode === 'floating') return;

    // Remove from tiling tree
    let newRoot = layout.tilingRoot;
    if (newRoot) {
      newRoot = removeLeaf(newRoot, id);
    }

    // Add floating panel maximized to fill the layout area
    const panel: FloatingPanelState = {
      terminalId: id,
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight - 60,
      zIndex: nextZIndex,
      maximized: true,
    };

    const updatedInstance: TerminalInstance = { ...instance, mode: 'floating' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    set({
      terminals: newTerminals,
      layout: {
        tilingRoot: newRoot,
        floatingPanels: [...layout.floatingPanels, panel],
      },
      nextZIndex: nextZIndex + 1,
      focusedTerminalId: id,
      focusModeTerminalId: get().focusModeTerminalId === id ? null : get().focusModeTerminalId,
    });
  },

  moveToTiling: (
    id: TerminalId,
    targetId?: TerminalId,
    side?: 'left' | 'right' | 'top' | 'bottom',
  ) => {
    const { terminals, layout } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode === 'tiled') return;

    // Remove from floating panels
    const newFloating = layout.floatingPanels.filter(
      (p) => p.terminalId !== id,
    );

    // Insert into tiling tree
    let newRoot: LayoutNode;
    if (layout.tilingRoot === null) {
      newRoot = { kind: 'leaf', terminalId: id };
    } else if (targetId && side) {
      newRoot = insertLeaf(layout.tilingRoot, targetId, id, side);
    } else {
      // Default: insert to the right of the last leaf
      const order = getLeafOrder(layout.tilingRoot);
      const lastId = order[order.length - 1];
      newRoot = insertLeaf(layout.tilingRoot, lastId, id, 'right');
    }

    const updatedInstance: TerminalInstance = { ...instance, mode: 'tiled' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: id,
    });
  },

  moveToDormant: (id: TerminalId) => {
    const { terminals, layout, focusedTerminalId } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode === 'dormant') return;

    let newRoot = layout.tilingRoot;
    let newFloating = layout.floatingPanels;

    if (instance.mode === 'tiled' && newRoot) {
      newRoot = removeLeaf(newRoot, id);
    } else if (instance.mode === 'floating') {
      newFloating = newFloating.filter((p) => p.terminalId !== id);
    }

    const updatedInstance: TerminalInstance = { ...instance, mode: 'dormant' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    // Move focus to another terminal if this one was focused
    let newFocus = focusedTerminalId;
    if (focusedTerminalId === id) {
      const tiledOrder = newRoot ? getLeafOrder(newRoot) : [];
      const floatingIds = newFloating.map((p) => p.terminalId);
      const allVisible = [...tiledOrder, ...floatingIds];
      newFocus = allVisible.length > 0 ? allVisible[0] : null;
    }

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: newFocus,
      focusModeTerminalId: get().focusModeTerminalId === id ? null : get().focusModeTerminalId,
    });
  },

  wakeFromDormant: (id: TerminalId) => {
    const { terminals, layout } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode !== 'dormant') return;

    let newRoot: LayoutNode;
    if (layout.tilingRoot === null) {
      newRoot = { kind: 'leaf', terminalId: id };
    } else {
      // Insert based on tab order: find the nearest tiled neighbor
      const tabOrder = Array.from(terminals.keys());
      const myIdx = tabOrder.indexOf(id);
      const tiledLeaves = new Set(getLeafOrder(layout.tilingRoot));

      // Look left in tab order for a tiled neighbor to insert after
      let insertAfterId: TerminalId | null = null;
      for (let i = myIdx - 1; i >= 0; i--) {
        if (tiledLeaves.has(tabOrder[i])) {
          insertAfterId = tabOrder[i];
          break;
        }
      }

      if (insertAfterId) {
        newRoot = insertLeaf(layout.tilingRoot, insertAfterId, id, 'right');
      } else {
        // No tiled tab before us — look right for one to insert before
        let insertBeforeId: TerminalId | null = null;
        for (let i = myIdx + 1; i < tabOrder.length; i++) {
          if (tiledLeaves.has(tabOrder[i])) {
            insertBeforeId = tabOrder[i];
            break;
          }
        }
        if (insertBeforeId) {
          newRoot = insertLeaf(layout.tilingRoot, insertBeforeId, id, 'left');
        } else {
          // Fallback: insert at the end
          const order = getLeafOrder(layout.tilingRoot);
          newRoot = insertLeaf(layout.tilingRoot, order[order.length - 1], id, 'right');
        }
      }
    }

    const updatedInstance: TerminalInstance = { ...instance, mode: 'tiled' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: newRoot },
      focusedTerminalId: id,
    });
  },

  detachTerminal: async (id: TerminalId) => {
    const { terminals, layout } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode === 'detached') return;

    let newRoot = layout.tilingRoot;
    let newFloating = layout.floatingPanels;

    if (instance.mode === 'tiled' && newRoot) {
      newRoot = removeLeaf(newRoot, id);
    } else if (instance.mode === 'floating') {
      newFloating = newFloating.filter((p) => p.terminalId !== id);
    }

    const updatedInstance: TerminalInstance = { ...instance, mode: 'detached' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    await window.terminalAPI.detachTerminal(id);

    // Move focus to another visible terminal
    const tiledOrder = newRoot ? getLeafOrder(newRoot) : [];
    const floatingIds = newFloating.map((p) => p.terminalId);
    const allVisible = [...tiledOrder, ...floatingIds];
    const newFocus = allVisible.length > 0 ? allVisible[0] : null;

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: newFocus,
      focusModeTerminalId: get().focusModeTerminalId === id ? null : get().focusModeTerminalId,
    });
  },

  reattachTerminal: (id: TerminalId) => {
    const { terminals, layout } = get();
    const instance = terminals.get(id);
    if (!instance || instance.mode !== 'detached') return;

    const updatedInstance: TerminalInstance = { ...instance, mode: 'tiled' };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, updatedInstance);

    let newRoot: LayoutNode;
    if (layout.tilingRoot === null) {
      newRoot = { kind: 'leaf', terminalId: id };
    } else {
      const order = getLeafOrder(layout.tilingRoot);
      const lastId = order[order.length - 1];
      newRoot = insertLeaf(layout.tilingRoot, lastId, id, 'right');
    }

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: newRoot },
      focusedTerminalId: id,
    });
  },

  updateFloatingPanel: (
    id: TerminalId,
    partial: Partial<FloatingPanelState>,
  ) => {
    const { layout } = get();
    const newFloating = layout.floatingPanels.map((p) =>
      p.terminalId === id ? { ...p, ...partial } : p,
    );
    set({ layout: { ...layout, floatingPanels: newFloating } });
  },

  focusNext: () => {
    const { terminals, focusedTerminalId } = get();

    // Use Map insertion order (same as tab bar), skip dormant
    const order = Array.from(terminals.entries())
      .filter(([, t]) => t.mode !== 'dormant' && t.mode !== 'detached')
      .map(([id]) => id);
    if (order.length === 0) return;

    if (!focusedTerminalId) {
      get().setFocus(order[0]);
      return;
    }

    const idx = order.indexOf(focusedTerminalId);
    const nextIdx = (idx + 1) % order.length;
    get().setFocus(order[nextIdx]);
  },

  focusPrev: () => {
    const { terminals, focusedTerminalId } = get();

    // Use Map insertion order (same as tab bar), skip dormant
    const order = Array.from(terminals.entries())
      .filter(([, t]) => t.mode !== 'dormant' && t.mode !== 'detached')
      .map(([id]) => id);
    if (order.length === 0) return;

    if (!focusedTerminalId) {
      get().setFocus(order[order.length - 1]);
      return;
    }

    const idx = order.indexOf(focusedTerminalId);
    const prevIdx = (idx - 1 + order.length) % order.length;
    get().setFocus(order[prevIdx]);
  },

  focusDirection: (dir: 'left' | 'right' | 'up' | 'down') => {
    const { layout, focusedTerminalId } = get();
    if (!layout.tilingRoot || !focusedTerminalId) return;

    const neighbor = findDirectionalNeighbor(
      layout.tilingRoot,
      focusedTerminalId,
      dir,
    );
    if (neighbor) {
      set({ focusedTerminalId: neighbor });
    }
  },

  renameTerminal: (id: TerminalId, title: string, custom?: boolean) => {
    const { terminals } = get();
    const instance = terminals.get(id);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    newTerminals.set(id, { ...instance, title, customTitle: custom ?? instance.customTitle });
    set({ terminals: newTerminals });
  },

  setTabColor: (id: TerminalId, color: string | undefined) => {
    const { terminals } = get();
    const instance = terminals.get(id);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    newTerminals.set(id, { ...instance, tabColor: color });
    set({ terminals: newTerminals });
  },

  toggleSwitcher: () => {
    set((state) => ({ showSwitcher: !state.showSwitcher }));
  },

  toggleShortcuts: () => {
    set((state) => ({ showShortcuts: !state.showShortcuts }));
  },

  toggleCommandPalette: () => {
    set((state) => ({ showCommandPalette: !state.showCommandPalette }));
  },

  toggleSettings: () => {
    set((state) => ({ showSettings: !state.showSettings }));
  },

  updateConfig: async (update: Partial<AppConfig>) => {
    const { config } = get();
    if (!config) return;
    const newConfig = { ...config, ...update };
    for (const [key, value] of Object.entries(update)) {
      await window.terminalAPI.setConfig(key, value);
    }
    if (update.theme) applyThemeToChromeVars(newConfig.theme);
    set({ config: newConfig });
  },

  toggleTabBarPosition: () => {
    set((state) => ({ tabBarPosition: state.tabBarPosition === 'top' ? 'left' : 'top' }));
  },

  startRenaming: (id: TerminalId | null) => {
    set({ renamingTerminalId: id });
  },

  toggleFocusMode: (id?: TerminalId) => {
    const { focusModeTerminalId, focusedTerminalId } = get();
    const targetId = id ?? focusedTerminalId;
    if (!targetId) return;

    if (focusModeTerminalId === targetId) {
      set({ focusModeTerminalId: null });
    } else {
      set({ focusModeTerminalId: targetId, focusedTerminalId: targetId });
    }
  },

  toggleSelectTerminal: (id: TerminalId) => {
    const { selectedTerminalIds } = get();
    const next = { ...selectedTerminalIds };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    set({ selectedTerminalIds: next });
  },

  clearSelection: () => {
    set({ selectedTerminalIds: {} });
  },

  equalizeLayout: () => {
    const { layout } = get();
    if (!layout.tilingRoot || layout.tilingRoot.kind === 'leaf') return;

    function countLeaves(node: LayoutNode): number {
      if (node.kind === 'leaf') return 1;
      return countLeaves(node.first) + countLeaves(node.second);
    }

    function equalize(node: LayoutNode): LayoutNode {
      if (node.kind === 'leaf') return node;
      const firstCount = countLeaves(node.first);
      const secondCount = countLeaves(node.second);
      const ratio = firstCount / (firstCount + secondCount);
      return {
        ...node,
        splitRatio: ratio,
        first: equalize(node.first),
        second: equalize(node.second),
      };
    }

    set({ layout: { ...layout, tilingRoot: equalize(layout.tilingRoot) } });
  },

  moveTerminalDirection: (id: TerminalId, dir: 'up' | 'down' | 'left' | 'right') => {
    const { layout } = get();
    if (!layout.tilingRoot) return;
    const neighbor = findDirectionalNeighbor(layout.tilingRoot, id, dir);
    if (neighbor) {
      const newRoot = swapLeaves(layout.tilingRoot, id, neighbor);
      set({ layout: { ...layout, tilingRoot: newRoot } });
    }
  },

  zoomIn: () => {
    set((state) => ({ fontSize: Math.min(state.fontSize + 1, 32) }));
  },

  zoomOut: () => {
    set((state) => ({ fontSize: Math.max(state.fontSize - 1, 8) }));
  },

  zoomReset: () => {
    const { config } = get();
    set({ fontSize: config?.terminal?.fontSize ?? 14 });
  },

  saveNamedLayout: async (name: string) => {
    const { terminals, layout } = get();

    // Serialize layout tree with terminal info at each leaf
    function serializeNode(node: LayoutNode): unknown {
      if (node.kind === 'leaf') {
        const t = terminals.get(node.terminalId);
        return {
          kind: 'leaf',
          terminal: {
            title: t?.title ?? 'Terminal',
            shellProfileId: t?.shellProfileId ?? '',
            cwd: t?.cwd ?? 'C:\\Users',
            lastProcess: t?.lastProcess ?? '',
            startupCommand: t?.startupCommand ?? '',
          },
        };
      }
      return {
        kind: 'split',
        direction: node.direction,
        splitRatio: node.splitRatio,
        first: serializeNode(node.first),
        second: serializeNode(node.second),
      };
    }

    const serialized = {
      tree: layout.tilingRoot ? serializeNode(layout.tilingRoot) : null,
      floating: layout.floatingPanels.map((p) => {
        const t = terminals.get(p.terminalId);
        return {
          terminal: { title: t?.title ?? 'Terminal', shellProfileId: t?.shellProfileId ?? '', cwd: t?.cwd ?? 'C:\\Users', lastProcess: t?.lastProcess ?? '', startupCommand: t?.startupCommand ?? '' },
          x: p.x, y: p.y, width: p.width, height: p.height,
        };
      }),
    };

    const layouts = (_sessionExtras.layouts as Record<string, unknown>) ?? {};
    layouts[name] = serialized;
    _sessionExtras = { ..._sessionExtras, layouts };
    await window.terminalAPI.saveSession(_sessionExtras);
  },

  loadNamedLayout: async (name: string) => {
    const saved = (_sessionExtras.layouts as Record<string, unknown>)?.[name] as { tree?: unknown; floating?: unknown[] } | undefined;
    if (!saved) return false;

    const { config } = get();
    if (!config) return false;

    // Close all existing terminals
    const { terminals } = get();
    for (const [id] of terminals) {
      await window.terminalAPI.killPty(id);
    }
    set({ terminals: new Map(), layout: { tilingRoot: null, floatingPanels: [] }, focusedTerminalId: null });

    // Helper to create a pty and terminal instance
    async function createTerm(info: { title: string; shellProfileId: string; cwd: string }): Promise<{ id: TerminalId; instance: TerminalInstance } | null> {
      const profile = config!.shells.find((s) => s.id === info.shellProfileId) ?? config!.shells[0];
      if (!profile) return null;
      const id = uuidv4();
      try {
        const { pid } = await window.terminalAPI.createPty({
          id, shellPath: profile.path, args: profile.args, cwd: info.cwd || 'C:\\Users', env: profile.env, cols: 80, rows: 24,
        });
        return { id, instance: { id, title: info.title || profile.name, customTitle: !!info.title, shellProfileId: profile.id, cwd: info.cwd, mode: 'tiled' as const, pid, lastProcess: '', startupCommand: info.startupCommand || '' } };
      } catch { return null; }
    }

    // Rebuild layout tree recursively
    const newTerminals = new Map<TerminalId, TerminalInstance>();
    let firstTerminalId: TerminalId | null = null;

    async function rebuildNode(node: any): Promise<LayoutNode | null> {
      if (node.kind === 'leaf') {
        const result = await createTerm(node.terminal);
        if (!result) return null;
        newTerminals.set(result.id, result.instance);
        if (!firstTerminalId) firstTerminalId = result.id;
        return { kind: 'leaf', terminalId: result.id };
      }
      if (node.kind === 'split') {
        const first = await rebuildNode(node.first);
        const second = await rebuildNode(node.second);
        if (!first && !second) return null;
        if (!first) return second;
        if (!second) return first;
        return {
          kind: 'split',
          id: uuidv4(),
          direction: node.direction,
          splitRatio: node.splitRatio ?? 0.5,
          first,
          second,
        };
      }
      return null;
    }

    let newRoot: LayoutNode | null = null;
    if (saved.tree) {
      newRoot = await rebuildNode(saved.tree);
    }

    // Restore floating panels
    const newFloating: FloatingPanelState[] = [];
    if (Array.isArray(saved.floating)) {
      for (const f of saved.floating as any[]) {
        const result = await createTerm(f.terminal);
        if (result) {
          result.instance.mode = 'floating';
          newTerminals.set(result.id, result.instance);
          newFloating.push({ terminalId: result.id, x: f.x ?? 200, y: f.y ?? 150, width: f.width ?? 600, height: f.height ?? 400, zIndex: 100 });
          if (!firstTerminalId) firstTerminalId = result.id;
        }
      }
    }

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: firstTerminalId,
    });
    return true;
  },

  getLayoutNames: async () => {
    const layouts = (_sessionExtras.layouts as Record<string, unknown>) ?? {};

    function countNodes(node: any): number {
      if (!node) return 0;
      if (node.kind === 'leaf') return 1;
      if (node.kind === 'split') return countNodes(node.first) + countNodes(node.second);
      return 0;
    }

    return Object.entries(layouts).map(([name, data]) => {
      const d = data as { tree?: unknown; floating?: unknown[] };
      const tiled = countNodes(d?.tree);
      const floating = Array.isArray(d?.floating) ? d.floating.length : 0;
      return { name, count: tiled + floating };
    });
  },

  addFavoriteDir: (dir: string) => {
    const { favoriteDirs } = get();
    if (favoriteDirs.includes(dir)) return;
    const updated = [...favoriteDirs, dir];
    set({ favoriteDirs: updated });
    get().saveDirs();
  },

  removeFavoriteDir: (dir: string) => {
    const updated = get().favoriteDirs.filter((d) => d !== dir);
    set({ favoriteDirs: updated });
    get().saveDirs();
  },

  addRecentDir: (dir: string) => {
    // Only add actual directories, not executable paths
    if (/\.(exe|cmd|bat|com|ps1|sh|msi|dll)$/i.test(dir)) return;
    const { recentDirs } = get();
    const filtered = recentDirs.filter((d) => d !== dir);
    const updated = [dir, ...filtered].slice(0, 10);
    set({ recentDirs: updated });
    get().saveDirs();
  },

  removeRecentDir: (dir: string) => {
    const updated = get().recentDirs.filter((d) => d !== dir);
    set({ recentDirs: updated });
    get().saveDirs();
  },

  cdToDir: (dir: string) => {
    const { focusedTerminalId } = get();
    if (!focusedTerminalId) return;
    window.terminalAPI.writePty(focusedTerminalId, `cd "${dir}"\r`);
    get().addRecentDir(dir);
  },

  toggleDirPicker: () => {
    set((state) => ({ showDirPicker: !state.showDirPicker }));
  },

  openTabMenu: (id?: TerminalId) => {
    const targetId = id ?? get().focusedTerminalId;
    if (targetId) set({ tabMenuTerminalId: targetId });
  },

  loadDirs: async () => {
    const session = (await window.terminalAPI.loadSession()) as Record<string, unknown> | null;
    if (session) {
      _sessionExtras = { ..._sessionExtras, ...session };
      const isNotExe = (d: string) => !/\.(exe|cmd|bat|com|ps1|sh|msi|dll)$/i.test(d);
      set({
        favoriteDirs: ((session.favoriteDirs as string[]) ?? []).filter(isNotExe),
        recentDirs: ((session.recentDirs as string[]) ?? []).filter(isNotExe),
      });
    }
  },

  saveDirs: async () => {
    // Just trigger a full save — avoids race conditions with separate saves
    get().saveSession();
  },

  saveSession: async () => {
    const { terminals, layout, favoriteDirs, recentDirs } = get();

    function serializeNode(node: LayoutNode): unknown {
      if (node.kind === 'leaf') {
        const t = terminals.get(node.terminalId);
        return { kind: 'leaf', terminal: { title: t?.title ?? 'Terminal', shellProfileId: t?.shellProfileId ?? '', cwd: t?.cwd ?? 'C:\\Users' } };
      }
      return { kind: 'split', direction: node.direction, splitRatio: node.splitRatio, first: serializeNode(node.first), second: serializeNode(node.second) };
    }

    // Merge with cached extras (saved layouts, etc.) — no async load needed
    const data = {
      ..._sessionExtras,
      favoriteDirs,
      recentDirs,
      tree: layout.tilingRoot ? serializeNode(layout.tilingRoot) : null,
      floating: layout.floatingPanels.map((p) => {
        const t = terminals.get(p.terminalId);
        return { terminal: { title: t?.title ?? 'Terminal', shellProfileId: t?.shellProfileId ?? '', cwd: t?.cwd ?? 'C:\\Users' }, x: p.x, y: p.y, width: p.width, height: p.height };
      }),
    };
    _sessionExtras = data;
    await window.terminalAPI.saveSession(data);
  },

  restoreSession: async () => {
    const session = (await window.terminalAPI.loadSession()) as Record<string, unknown> | null;
    if (!session) return false;
    // Cache session extras (layouts, etc.) so saveSession doesn't need async load
    _sessionExtras = { ...session };

    const { config } = get();
    if (!config) return false;

    // New tree format
    if (session.tree || session.floating) {
      async function createTerm(info: { title: string; shellProfileId: string; cwd: string }): Promise<{ id: TerminalId; instance: TerminalInstance } | null> {
        const profile = config!.shells.find((s) => s.id === info.shellProfileId) ?? config!.shells[0];
        if (!profile) return null;
        const id = uuidv4();
        // Sanitize cwd: skip executable paths that were incorrectly saved as cwd
        let cwd = info.cwd || '';
        if (/\.(exe|cmd|bat|com|ps1|sh|msi|dll)$/i.test(cwd) || !cwd) {
          cwd = profile.cwd || (navigator.platform.startsWith('Win') ? 'C:\\Users' : process.env.HOME || '/');
        }
        try {
          const { pid } = await window.terminalAPI.createPty({
            id, shellPath: profile.path, args: profile.args, cwd, env: profile.env, cols: 80, rows: 24,
          });
          return { id, instance: { id, title: info.title || profile.name, customTitle: !!info.title, shellProfileId: profile.id, cwd, mode: 'tiled' as const, pid, lastProcess: '', startupCommand: info.startupCommand || '' } };
        } catch { return null; }
      }

      const newTerminals = new Map<TerminalId, TerminalInstance>();
      let firstId: TerminalId | null = null;

      async function rebuildNode(node: any): Promise<LayoutNode | null> {
        if (node.kind === 'leaf') {
          const result = await createTerm(node.terminal);
          if (!result) return null;
          newTerminals.set(result.id, result.instance);
          if (!firstId) firstId = result.id;
          return { kind: 'leaf', terminalId: result.id };
        }
        if (node.kind === 'split') {
          const first = await rebuildNode(node.first);
          const second = await rebuildNode(node.second);
          if (!first && !second) return null;
          if (!first) return second;
          if (!second) return first;
          return { kind: 'split', id: uuidv4(), direction: node.direction, splitRatio: node.splitRatio ?? 0.5, first, second };
        }
        return null;
      }

      let newRoot: LayoutNode | null = null;
      if (session.tree) newRoot = await rebuildNode(session.tree);

      const newFloating: FloatingPanelState[] = [];
      if (Array.isArray(session.floating)) {
        for (const f of session.floating as any[]) {
          const result = await createTerm(f.terminal);
          if (result) {
            result.instance.mode = 'floating';
            newTerminals.set(result.id, result.instance);
            newFloating.push({ terminalId: result.id, x: f.x ?? 200, y: f.y ?? 150, width: f.width ?? 600, height: f.height ?? 400, zIndex: 100 });
            if (!firstId) firstId = result.id;
          }
        }
      }

      if (newTerminals.size === 0) return false;
      set({ terminals: newTerminals, layout: { tilingRoot: newRoot, floatingPanels: newFloating }, focusedTerminalId: firstId });
      return true;
    }

    // Legacy flat format fallback
    const legacyTerminals = (session as any).terminals as { title: string; shellProfileId: string; cwd: string }[] | undefined;
    if (!legacyTerminals?.length) return false;

    for (const saved of legacyTerminals) {
      const profile = config.shells.find((s) => s.id === saved.shellProfileId) ?? config.shells[0];
      if (!profile) continue;
      const id = uuidv4();
      try {
        const { pid } = await window.terminalAPI.createPty({ id, shellPath: profile.path, args: profile.args, cwd: saved.cwd || 'C:\\Users', env: profile.env, cols: 80, rows: 24 });
        const instance: TerminalInstance = { id, title: saved.title || profile.name, shellProfileId: profile.id, cwd: saved.cwd, mode: 'tiled', pid };
        const { terminals, layout } = get();
        const newTerminals = new Map(terminals);
        newTerminals.set(id, instance);
        const newLeaf: LayoutLeafNode = { kind: 'leaf', terminalId: id };
        let newRoot: LayoutNode;
        if (layout.tilingRoot === null) { newRoot = newLeaf; } else {
          const order = getLeafOrder(layout.tilingRoot);
          newRoot = insertLeaf(layout.tilingRoot, order[order.length - 1], id, 'right');
        }
        set({ terminals: newTerminals, layout: { ...layout, tilingRoot: newRoot }, focusedTerminalId: id });
      } catch { /* skip */ }
    }
    return true;
  },

  setDragging: (isDragging: boolean, terminalId?: TerminalId) => {
    set({
      isDragging,
      draggedTerminalId: isDragging ? (terminalId ?? null) : null,
    });
  },
}));
