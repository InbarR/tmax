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
  TabGroup,
} from './types';
import type { CopilotSessionSummary } from '../../shared/copilot-types';
import type { DiffMode } from '../../shared/diff-types';
import type { RepoWorktrees } from '../../shared/worktree-types';
import { getAllTerminals, getTerminalEntry } from '../terminal-registry';

// Session IDs must be alphanumeric/dash/dot/underscore only (prevent shell injection)
const SAFE_SESSION_ID = /^[a-zA-Z0-9._-]+$/;

function validateSessionId(id: string): boolean {
  return SAFE_SESSION_ID.test(id);
}

type SessionProvider = 'copilot' | 'claude-code';

function buildResumeCommand(config: AppConfig, provider: SessionProvider, sessionId: string): string {
  const cmd = provider === 'copilot'
    ? (config.copilotCommand || 'copilot')
    : (config.claudeCodeCommand || 'claude');
  return `${cmd} --resume ${sessionId}`;
}

async function openAiSession(
  sessionId: string,
  provider: SessionProvider,
  get: () => TerminalStore,
  set: (partial: Partial<TerminalStore> | ((s: TerminalStore) => Partial<TerminalStore>)) => void,
): Promise<void> {
  if (!validateSessionId(sessionId)) return;

  // If a terminal with this session is already open, just focus it
  const { terminals: existingTerminals } = get();
  for (const [id, inst] of existingTerminals) {
    if (inst.aiSessionId === sessionId) {
      set({ focusedTerminalId: id });
      return;
    }
  }

  // Fetch session details via IPC
  const session = provider === 'copilot'
    ? await (window.terminalAPI as any).getCopilotSession(sessionId)
    : await (window.terminalAPI as any).getClaudeCodeSession(sessionId);
  if (!session) return;

  const store = get();
  const config = store.config;
  if (!config) return;

  // Determine WSL status from the session summary list
  const sessionList = provider === 'copilot' ? store.copilotSessions : store.claudeCodeSessions;
  const sessionSummary = sessionList.find((s) => s.id === sessionId);
  const isWsl = sessionSummary?.wsl === true;
  const wslDistro = sessionSummary?.wslDistro;

  // Extract CWD from the session (different shape per provider)
  const sessionCwd = provider === 'copilot' ? session.workspace?.cwd : session.cwd;

  const id = uuidv4();
  let shellProfileId: string;
  let shellPath: string;
  let shellArgs: string[];
  let shellEnv: Record<string, string> | undefined;
  let termCwd: string;

  if (isWsl && wslDistro) {
    const wslProfile = config.shells.find((s) => s.id === 'wsl');
    if (!wslProfile) return;
    shellProfileId = 'wsl';
    shellPath = wslProfile.path;
    shellArgs = wslProfile.args;
    shellEnv = wslProfile.env;
    termCwd = sessionCwd || '/';
  } else {
    const profileId = config.defaultShellId;
    const profile = config.shells.find((s) => s.id === profileId);
    if (!profile) return;
    shellProfileId = profileId;
    shellPath = profile.path;
    shellArgs = profile.args;
    shellEnv = profile.env;
    termCwd = sessionCwd || profile.cwd || (navigator.platform.startsWith('Win') ? 'C:\\Users' : '/');
  }

  const startupCommand = buildResumeCommand(config, provider, sessionId);

  const { pid } = await window.terminalAPI.createPty({
    id, shellPath, args: shellArgs, cwd: termCwd, env: shellEnv,
    cols: 80, rows: 24,
    wslDistro: isWsl ? wslDistro : undefined,
  });

  // Build display title
  let displayName: string;
  if (provider === 'copilot') {
    displayName = session.workspace?.summary
      || (session.workspace?.repository ? session.workspace.repository.split('/').pop() : null)
      || session.workspace?.name
      || sessionId.slice(0, 8);
  } else {
    displayName = session.summary || sessionId.slice(0, 8);
  }

  const instance: TerminalInstance = {
    id,
    title: displayName,
    shellProfileId,
    cwd: isWsl ? (sessionCwd || termCwd) : termCwd,
    customTitle: true,
    aiAutoTitle: true,
    mode: 'tiled',
    pid,
    lastProcess: '',
    startupCommand,
    aiSessionId: sessionId,
    wsl: isWsl || undefined,
    wslDistro: wslDistro || undefined,
  };

  const { terminals, layout } = get();
  const newTerminals = new Map(terminals);
  newTerminals.set(id, instance);
  const newLeaf: LayoutLeafNode = { kind: 'leaf', terminalId: id };
  let newRoot: LayoutNode;
  if (layout.tilingRoot === null) {
    newRoot = newLeaf;
  } else {
    const order = getLeafOrder(layout.tilingRoot);
    newRoot = insertLeaf(layout.tilingRoot, order[order.length - 1], id, 'right');
  }

  const { viewMode, preGridRoot, gridColumns } = get();
  let newPreGridRoot = preGridRoot;
  if (viewMode === 'grid') {
    if (preGridRoot) {
      const preOrder = getLeafOrder(preGridRoot);
      newPreGridRoot = insertLeaf(preGridRoot, preOrder[preOrder.length - 1], id, 'right');
    }
    const allIds = getLeafOrder(newRoot);
    newRoot = buildGridTree(allIds, gridColumns || undefined) || newRoot;
  }

  set({
    terminals: newTerminals,
    layout: { ...layout, tilingRoot: newRoot },
    focusedTerminalId: id,
    preGridRoot: newPreGridRoot,
  });
}

export const TAB_COLORS = [
  // First 4 = Microsoft logo colors
  { name: 'Red', value: '#F25022' },
  { name: 'Green', value: '#7FBA00' },
  { name: 'Blue', value: '#00A4EF' },
  { name: 'Yellow', value: '#FFB900' },
  // Extended palette - Fluent UI tones so they sit next to the MS logo colors without clashing
  { name: 'Purple', value: '#6264A7' },
  { name: 'Teal', value: '#00B7C3' },
  { name: 'Magenta', value: '#C239B3' },
  { name: 'Orange', value: '#D83B01' },
  { name: 'Gray', value: '#737373' },
  { name: 'Dark', value: '#323130' },
];

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

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function applyThemeToChromeVars(theme: Record<string, string>, transparencyOpacity?: number): void {
  const bg = theme.background || '#1e1e2e';
  const fg = theme.foreground || '#cdd6f4';
  const isLight = luminance(bg) > 0.5;
  const step = isLight ? -15 : 15;
  const useTransparency = transparencyOpacity !== undefined && transparencyOpacity < 1;

  const root = document.documentElement;

  if (useTransparency) {
    root.style.setProperty('--bg-primary', hexToRgba(bg, transparencyOpacity));
    root.style.setProperty('--bg-secondary', hexToRgba(adjustBrightness(bg, step), transparencyOpacity));
    root.style.setProperty('--tab-bg', hexToRgba(adjustBrightness(bg, step), transparencyOpacity));
    root.style.setProperty('--tab-active', hexToRgba(adjustBrightness(bg, step * 2), transparencyOpacity));
    root.classList.add('transparency-active');
  } else {
    root.style.setProperty('--bg-primary', bg);
    root.style.setProperty('--bg-secondary', adjustBrightness(bg, step));
    root.style.setProperty('--tab-bg', adjustBrightness(bg, step));
    root.style.setProperty('--tab-active', adjustBrightness(bg, step * 2));
    root.classList.remove('transparency-active');
  }

  root.style.setProperty('--border-color', adjustBrightness(bg, step * 2));
  root.style.setProperty('--text-primary', fg);
  root.style.setProperty('--text-secondary', adjustBrightness(fg, isLight ? 60 : -60));
  root.style.setProperty('--focus-border', theme.blue || '#89b4fa');

  // Sync every live xterm.js instance so canvases match the new transparency
  syncTerminalTransparency(theme, useTransparency && transparencyOpacity !== undefined ? transparencyOpacity : undefined);
}

/**
 * Update all live xterm.js terminal instances to match the current
 * transparency / theme settings so terminals don't keep stale backgrounds.
 */
function syncTerminalTransparency(theme: Record<string, string>, opacity?: number): void {
  const terminals = getAllTerminals();
  const bg = theme.background || '#1e1e2e';
  const useTransparency = opacity !== undefined && opacity < 1;
  const bgColor = useTransparency ? hexToRgba(bg, opacity) : bg;

  for (const term of terminals) {
    term.options.allowTransparency = useTransparency;
    term.options.theme = {
      ...term.options.theme,
      background: bgColor,
    };
    term.refresh(0, term.rows - 1);
  }
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

// ── Grid layout builder ──────────────────────────────────────────────

function buildGridRow(ids: TerminalId[]): LayoutNode {
  if (ids.length === 1) return { kind: 'leaf', terminalId: ids[0] };
  const mid = Math.ceil(ids.length / 2);
  return {
    kind: 'split',
    id: uuidv4(),
    direction: 'horizontal',
    splitRatio: mid / ids.length,
    first: buildGridRow(ids.slice(0, mid)),
    second: buildGridRow(ids.slice(mid)),
  };
}

function stackGridRows(nodes: LayoutNode[]): LayoutNode {
  if (nodes.length === 1) return nodes[0];
  const mid = Math.ceil(nodes.length / 2);
  return {
    kind: 'split',
    id: uuidv4(),
    direction: 'vertical',
    splitRatio: mid / nodes.length,
    first: stackGridRows(nodes.slice(0, mid)),
    second: stackGridRows(nodes.slice(mid)),
  };
}

function buildGridTree(terminalIds: TerminalId[], forceCols?: number): LayoutNode | null {
  if (terminalIds.length === 0) return null;
  if (terminalIds.length === 1) return { kind: 'leaf', terminalId: terminalIds[0] };
  const n = terminalIds.length;
  const cols = forceCols && forceCols > 0 ? Math.min(forceCols, n) : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const rowNodes: LayoutNode[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const rowTerminals: TerminalId[] = [];
    for (let c = 0; c < cols && idx < n; c++) {
      rowTerminals.push(terminalIds[idx++]);
    }
    rowNodes.push(buildGridRow(rowTerminals));
  }
  return stackGridRows(rowNodes);
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
  showPaneHints: boolean;
  showShortcuts: boolean;
  showCommandPalette: boolean;
  showSettings: boolean;
  tabBarPosition: 'top' | 'bottom' | 'left' | 'right';
  hideTabTitles: boolean;
  hideTabCloseButtons: boolean;
  renamingTerminalId: TerminalId | null;
  viewMode: 'split' | 'focus' | 'grid';
  broadcastMode: boolean; // when true, typing in any pane is sent to all tiled panes
  gridColumns: number; // 0 = auto (sqrt-based), 1..N = fixed column count
  preGridRoot: LayoutNode | null; // saved layout before entering grid mode
  selectedTerminalIds: Record<TerminalId, true>;
  gridTabIds: Record<TerminalId, true>;
  fontSize: number;
  terminalOpacity: number;
  favoriteDirs: string[];
  recentDirs: string[];
  showDirPicker: boolean;
  showFileExplorer: boolean;
  // When set, FileExplorer consumes this path on next open then clears it.
  fileExplorerTargetPath: string | null;
  showWorktreePanel: boolean;
  worktreeRepos: RepoWorktrees[];
  worktreeLoading: boolean;
  tabMenuTerminalId: TerminalId | null;
  autoColorTabs: boolean;
  showCopilotPanel: boolean;
  copilotSessions: CopilotSessionSummary[];
  claudeCodeSessions: CopilotSessionSummary[];
  sessionNameOverrides: Record<string, string>;
  sessionLifecycleOverrides: Record<string, import('../../shared/copilot-types').SessionLifecycle>;
  /** Session IDs the user has pinned to the top of the AI sessions list */
  sessionPinned: Record<string, true>;
  toastNotifications: Array<{ id: string; message: string; timestamp: number }>;
  copilotSearchQuery: string;
  selectedCopilotSessionId: string | null;
  // Prompts dialog state
  promptsDialogRequest: { terminalId: TerminalId } | null;
  // AI session summary popover - holds the session ID that should be shown.
  sessionSummaryRequest: string | null;
  // Diff review state
  diffReviewOpen: boolean;
  diffReviewTerminalId: TerminalId | null;
  diffReviewMode: DiffMode;
  // Tab groups
  tabGroups: Map<string, TabGroup>;

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
  insertAtRoot: (id: TerminalId, side: 'left' | 'right' | 'top' | 'bottom') => void;
  moveToDormant: (id: TerminalId) => void;
  wakeFromDormant: (id: TerminalId) => void;
  detachTerminal: (id: TerminalId) => Promise<void>;
  reattachTerminal: (id: TerminalId) => void;
  updateFloatingPanel: (id: TerminalId, partial: Partial<FloatingPanelState>) => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusDirection: (dir: 'left' | 'right' | 'up' | 'down') => void;
  renameTerminal: (id: TerminalId, title: string, custom?: boolean) => void;
  setTabColor: (id: TerminalId, color: string | undefined) => void;
  colorizeAllTabs: () => void;
  setDragging: (isDragging: boolean, terminalId?: TerminalId) => void;
  toggleSwitcher: () => void;
  togglePaneHints: () => void;
  toggleShortcuts: () => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  closeSettings: () => void;
  updateConfig: (update: Partial<AppConfig>) => Promise<void>;
  toggleTabBarPosition: () => void;
  toggleHideTabTitles: () => void;
  toggleHideTabCloseButtons: () => void;
  setTerminalOpacity: (opacity: number) => void;
  startRenaming: (id: TerminalId | null) => void;
  toggleViewMode: () => void;
  toggleBroadcastMode: () => void;
  toggleSelectTerminal: (id: TerminalId) => void;
  clearSelection: () => void;
  gridSelectedTabs: (ids: TerminalId[]) => void;
  equalizeLayout: () => void;
  cycleGridColumns: () => void;
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
  toggleFileExplorer: () => void;
  openFileExplorerAt: (path: string) => void;
  toggleWorktreePanel: () => void;
  loadWorktrees: () => Promise<void>;
  createWorktree: (repoPath: string, branchName: string, baseBranch: string) => Promise<{ success: boolean; error?: string }>;
  deleteWorktree: (repoPath: string, worktreePath: string) => Promise<{ success: boolean; error?: string }>;
  openTabMenu: (id?: TerminalId) => void;
  loadDirs: () => Promise<void>;
  saveDirs: () => Promise<void>;
  toggleCopilotPanel: () => void;
  loadCopilotSessions: () => Promise<void>;
  searchCopilotSessions: (query: string) => Promise<void>;
  openCopilotSession: (sessionId: string) => Promise<void>;
  setCopilotSessions: (sessions: CopilotSessionSummary[]) => void;
  updateTerminalTitleFromSession: (session: CopilotSessionSummary, sessionType?: 'copilot' | 'claude') => void;
  addCopilotSession: (session: CopilotSessionSummary) => void;
  updateCopilotSession: (session: CopilotSessionSummary) => void;
  removeCopilotSession: (sessionId: string) => void;
  loadClaudeCodeSessions: () => Promise<void>;
  searchClaudeCodeSessions: (query: string) => Promise<void>;
  openClaudeCodeSession: (sessionId: string) => Promise<void>;
  addClaudeCodeSession: (session: CopilotSessionSummary) => void;
  updateClaudeCodeSession: (session: CopilotSessionSummary) => void;
  removeClaudeCodeSession: (sessionId: string) => void;
  setSessionNameOverride: (sessionId: string, name: string) => void;
  setSessionLifecycle: (sessionId: string, lifecycle: import('../../shared/copilot-types').SessionLifecycle) => void;
  togglePinSession: (sessionId: string) => void;
  checkStaleActiveSessions: () => void;
  addToast: (message: string) => void;
  dismissToast: (id: string) => void;
  resumeAllSessions: () => void;
  // Prompts dialog action
  showPromptsForTerminal: (terminalId: TerminalId) => void;
  clearPromptsDialogRequest: () => void;
  showSessionSummary: (sessionId: string) => void;
  clearSessionSummary: () => void;
  // Self-healing: in grid mode, ensures every tiled terminal is present in
  // the tilingRoot. Called from a subscribe() side-effect so any code path
  // that accidentally leaves an orphan pane gets reconciled on the next tick.
  reconcileGridLayout: () => void;
  // Tab group actions
  createTabGroup: (name: string, color: string) => string;
  deleteTabGroup: (groupId: string) => void;
  renameTabGroup: (groupId: string, name: string) => void;
  toggleTabGroupCollapse: (groupId: string) => void;
  addToGroup: (terminalId: TerminalId, groupId: string) => void;
  removeFromGroup: (terminalId: TerminalId) => void;
  // Diff review actions
  openDiffReview: (terminalId: TerminalId) => void;
  closeDiffReview: () => void;
  setDiffReviewMode: (mode: DiffMode) => void;
}

// Cached session extras (layouts, etc.) so saveSession doesn't need async load
let _sessionExtras: Record<string, unknown> = {};

// Guard against early saveSession calls wiping persisted overrides before
// restoreSession has populated the store. Flipped to true once restoreSession
// has completed (or confirmed no saved session exists).
let _sessionHydrated = false;
// Monotonically increasing counter to detect stale loadWorktrees() calls
let _loadWorktreesSeq = 0;

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
  showPaneHints: false,
  showShortcuts: false,
  showCommandPalette: false,
  showSettings: false,
  showDirPicker: false,
  showFileExplorer: false,
  fileExplorerTargetPath: null,
  showWorktreePanel: false,
  worktreeRepos: [] as RepoWorktrees[],
  worktreeLoading: false,
  autoColorTabs: true,
  showCopilotPanel: false,
  promptsDialogRequest: null,
  sessionSummaryRequest: null,
  copilotSessions: [],
  claudeCodeSessions: [],
  sessionNameOverrides: {},
  sessionLifecycleOverrides: {},
  sessionPinned: {},
  toastNotifications: [],
  copilotSearchQuery: '',
  selectedCopilotSessionId: null,
  tabGroups: new Map(),
  diffReviewOpen: false,
  diffReviewTerminalId: null,
  diffReviewMode: 'unstaged' as DiffMode,
  tabMenuTerminalId: null,
  favoriteDirs: [],
  recentDirs: [],
  tabBarPosition: 'top' as 'top' | 'bottom' | 'left' | 'right',
  hideTabTitles: false,
  hideTabCloseButtons: false,
  renamingTerminalId: null,
  viewMode: 'grid' as 'split' | 'focus' | 'grid',
  broadcastMode: false,
  gridColumns: 0,
  preGridRoot: null as LayoutNode | null,
  selectedTerminalIds: {} as Record<TerminalId, true>,
  gridTabIds: {} as Record<TerminalId, true>,
  fontSize: 14,
  terminalOpacity: 1,

  // ── Actions ──────────────────────────────────────────────────────

  loadConfig: async () => {
    const config = (await window.terminalAPI.getConfig()) as unknown as AppConfig;
    const materialActive = config?.backgroundMaterial && config.backgroundMaterial !== 'none';
    const opacity = materialActive ? (config?.backgroundOpacity ?? 0.8) : undefined;
    if (config?.theme) applyThemeToChromeVars(config.theme, opacity);
    const updates: Record<string, unknown> = { config };
    if (config?.tabBarPosition) updates.tabBarPosition = config.tabBarPosition;
    if (typeof (config as any)?.hideTabTitles === 'boolean') updates.hideTabTitles = (config as any).hideTabTitles;
    if (typeof (config as any)?.hideTabCloseButtons === 'boolean') updates.hideTabCloseButtons = (config as any).hideTabCloseButtons;
    if ((config as any)?.terminalOpacity != null) {
      updates.terminalOpacity = (config as any).terminalOpacity;
      document.documentElement.style.setProperty('--terminal-opacity', String((config as any).terminalOpacity));
    }
    set(updates);
  },

  createTerminal: async (shellProfileId?: string) => {
    const { config, terminals, layout, nextZIndex } = get();
    if (!config) return;

    const profileId = shellProfileId ?? config.defaultShellId;
    const profile = config.shells.find((s) => s.id === profileId);
    if (!profile) return;

    const id = uuidv4();
    const cwd = profile.cwd || (config as any).defaultCwd || ((window as any).platformInfo?.platform === 'win32' ? 'C:\\Users' : (window as any).platformInfo?.homeDir || '/');
    const { pid } = await window.terminalAPI.createPty({
      id,
      shellPath: profile.path,
      args: profile.args,
      cwd,
      env: profile.env,
      cols: 80,
      rows: 24,
    });

    // Auto-assign a color if colors mode is active — pick the least-used palette color
    const hasColors = get().autoColorTabs;
    let tabColor: string | undefined;
    if (hasColors) {
      const colorCounts = new Map<string, number>();
      for (const c of TAB_COLORS) colorCounts.set(c.value, 0);
      for (const t of terminals.values()) {
        if (t.tabColor && colorCounts.has(t.tabColor)) {
          colorCounts.set(t.tabColor, (colorCounts.get(t.tabColor) ?? 0) + 1);
        }
      }
      let minCount = Infinity;
      for (const [color, count] of colorCounts) {
        if (count < minCount) {
          minCount = count;
          tabColor = color;
        }
      }
    }

    const instance: TerminalInstance = {
      id,
      title: profile.name,
      shellProfileId: profileId,
      cwd,
      customTitle: false,
      mode: 'tiled',
      tabColor,
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
      // Insert next to the last terminal as a right split
      const leafOrder = getLeafOrder(layout.tilingRoot);
      const lastId = leafOrder[leafOrder.length - 1];
      newRoot = insertLeaf(layout.tilingRoot, lastId, id, 'right');
    }

    // In grid mode, also update preGridRoot and rebuild the grid
    const { viewMode, preGridRoot, gridColumns } = get();
    let newPreGridRoot = preGridRoot;
    if (viewMode === 'grid') {
      // Add to preGridRoot too
      if (preGridRoot) {
        const preOrder = getLeafOrder(preGridRoot);
        newPreGridRoot = insertLeaf(preGridRoot, preOrder[preOrder.length - 1], id, 'right');
      }
      // Rebuild grid with all terminals including the new one
      const allIds = getLeafOrder(newRoot);
      newRoot = buildGridTree(allIds, gridColumns || undefined) || newRoot;
    }

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: newRoot },
      focusedTerminalId: id,
      nextZIndex,
      preGridRoot: newPreGridRoot,
    });
  },

  closeTerminal: async (id: TerminalId) => {
    const t0 = performance.now();
    const { terminals, layout, focusedTerminalId } = get();
    const instance = terminals.get(id);
    if (!instance) return;

    if (instance.mode === 'detached') {
      await window.terminalAPI.closeDetached(id);
    }
    await window.terminalAPI.killPty(id);
    const t1 = performance.now();

    const newTerminals = new Map(terminals);
    newTerminals.delete(id);

    let newRoot = layout.tilingRoot;
    let newFloating = layout.floatingPanels;

    if (instance.mode === 'tiled' && newRoot) {
      newRoot = removeLeaf(newRoot, id);
    } else if (instance.mode === 'floating') {
      newFloating = newFloating.filter((p) => p.terminalId !== id);
    }

    // In grid mode, also update preGridRoot and rebuild the grid
    const { viewMode, preGridRoot, gridColumns } = get();
    let newPreGridRoot = preGridRoot;
    if (viewMode === 'grid' && instance.mode === 'tiled') {
      if (preGridRoot) {
        newPreGridRoot = removeLeaf(preGridRoot, id);
      }
      // Rebuild grid from remaining terminals
      const remainingIds = newRoot ? getLeafOrder(newRoot) : [];
      if (remainingIds.length > 0) {
        newRoot = buildGridTree(remainingIds, gridColumns || undefined);
      }
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

    set({
      terminals: newTerminals,
      layout: { tilingRoot: newRoot, floatingPanels: newFloating },
      focusedTerminalId: newFocus,
      preGridRoot: newPreGridRoot,
    });

    // After React processes the layout change, force-focus the new terminal.
    // Tree collapse causes the surviving TerminalPanel to unmount/remount,
    // and browsers can lose focus during DOM reparenting.
    if (newFocus) {
      const forceFocus = () => {
        const entry = getTerminalEntry(newFocus!);
        if (entry?.terminal && get().focusedTerminalId === newFocus) {
          entry.terminal.focus();
          const textarea = entry.terminal.element?.querySelector('textarea');
          if (textarea && document.activeElement !== textarea) {
            (textarea as HTMLElement).focus();
          }
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(forceFocus));
      setTimeout(forceFocus, 50);
      setTimeout(forceFocus, 150);
    }

    window.terminalAPI.diagLog('renderer:close-terminal', {
      id,
      remaining: newTerminals.size,
    });
  },

  setFocus: (id: TerminalId) => {
    const { terminals, layout, nextZIndex } = get();
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
    const { layout, terminals } = get();
    if (!layout.tilingRoot) return;
    const newRoot = swapLeaves(layout.tilingRoot, idA, idB);
    // Also swap tab order to keep tab bar in sync with grid positions
    const entries = Array.from(terminals.entries());
    const idxA = entries.findIndex(([id]) => id === idA);
    const idxB = entries.findIndex(([id]) => id === idB);
    if (idxA !== -1 && idxB !== -1) {
      [entries[idxA], entries[idxB]] = [entries[idxB], entries[idxA]];
      set({ layout: { ...layout, tilingRoot: newRoot }, terminals: new Map(entries) });
    } else {
      set({ layout: { ...layout, tilingRoot: newRoot } });
    }
  },

  reorderTerminals: (draggedId: TerminalId, overId: TerminalId) => {
    if (draggedId === overId) return;
    const { terminals, layout } = get();
    const entries = Array.from(terminals.entries());
    const fromIndex = entries.findIndex(([id]) => id === draggedId);
    const toIndex = entries.findIndex(([id]) => id === overId);
    if (fromIndex === -1 || toIndex === -1) return;

    // Adopt the drop target's group (or ungroup if target has no group)
    const overTerminal = terminals.get(overId);
    const draggedTerminal = terminals.get(draggedId);
    if (draggedTerminal && overTerminal && draggedTerminal.groupId !== overTerminal.groupId) {
      entries[fromIndex] = [draggedId, { ...draggedTerminal, groupId: overTerminal.groupId }];
    }

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

  insertAtRoot: (id: TerminalId, side: 'left' | 'right' | 'top' | 'bottom') => {
    const { terminals, layout } = get();
    if (!layout.tilingRoot) return;
    const instance = terminals.get(id);
    if (!instance) return;

    // Remove from floating panels (moveToFloat was called before this)
    const newFloating = layout.floatingPanels.filter((p) => p.terminalId !== id);

    const direction: SplitDirection = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
    const newLeaf: LayoutLeafNode = { kind: 'leaf', terminalId: id };
    const isFirst = side === 'left' || side === 'top';

    const newRoot: LayoutSplitNode = {
      kind: 'split',
      id: uuidv4(),
      direction,
      splitRatio: 0.5,
      first: isFirst ? newLeaf : layout.tilingRoot,
      second: isFirst ? layout.tilingRoot : newLeaf,
    };

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
    const t0 = performance.now();
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

    // Also remove from preGridRoot so restoring from grid mode won't
    // bring back a dormant terminal.
    const { preGridRoot, viewMode, gridColumns } = get();
    const newPreGridRoot = preGridRoot ? removeLeaf(preGridRoot, id) : null;

    // In grid mode, rebuild the grid so remaining terminals fill equally.
    if (viewMode === 'grid' && newRoot) {
      const remainingIds = getLeafOrder(newRoot);
      if (remainingIds.length > 0) {
        newRoot = buildGridTree(remainingIds, gridColumns || undefined) || newRoot;
      }
    }

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
      preGridRoot: newPreGridRoot,
    });
    window.terminalAPI.diagLog('renderer:move-to-dormant', {
      id,
      ms: Math.round(performance.now() - t0),
      remaining: newRoot ? getLeafOrder(newRoot).length : 0,
      newFocus,
    });
  },

  wakeFromDormant: (id: TerminalId) => {
    const t0 = performance.now();
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

    // Keep preGridRoot in sync so a later grid→focus toggle restores a tree
    // that includes the woken terminal (fixes #70 blank focus mode when a
    // terminal was woken in grid mode between the two toggles).
    const { viewMode, preGridRoot, gridColumns } = get();
    let newPreGridRoot = preGridRoot;
    if (preGridRoot) {
      const preOrder = getLeafOrder(preGridRoot);
      if (preOrder.length > 0) {
        newPreGridRoot = insertLeaf(preGridRoot, preOrder[preOrder.length - 1], id, 'right');
      } else {
        newPreGridRoot = { kind: 'leaf', terminalId: id };
      }
    }

    // In grid mode, rebuild the grid so the woken terminal slots in cleanly.
    let finalRoot = newRoot;
    if (viewMode === 'grid' && finalRoot) {
      const allIds = getLeafOrder(finalRoot);
      finalRoot = buildGridTree(allIds, gridColumns || undefined) || finalRoot;
    }

    set({
      terminals: newTerminals,
      layout: { ...layout, tilingRoot: finalRoot },
      focusedTerminalId: id,
      preGridRoot: newPreGridRoot,
    });
    window.terminalAPI.diagLog('renderer:wake-from-dormant', {
      id,
      ms: Math.round(performance.now() - t0),
      tiled: finalRoot ? getLeafOrder(finalRoot).length : 0,
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

  reconcileGridLayout: () => {
    const { viewMode, terminals, layout, gridColumns, gridTabIds } = get();
    if (viewMode !== 'grid') return;

    // If the user explicitly gridded a subset via gridSelectedTabs, respect
    // that scope - only reconcile within the selected set.
    const hasSubsetScope = Object.keys(gridTabIds).length > 0;
    const eligibleIds = Array.from(terminals.entries())
      .filter(([id, t]) => t.mode === 'tiled' && (!hasSubsetScope || gridTabIds[id]))
      .map(([id]) => id);

    const treeIds = layout.tilingRoot ? getLeafOrder(layout.tilingRoot) : [];
    if (eligibleIds.length === treeIds.length) return;

    // Orphans exist - some path added a tiled terminal without inserting it
    // into tilingRoot. Rebuild the grid so the missing panes show up.
    // Tab-order (Map insertion order) is authoritative for position, which
    // matches the "grid follows tab order" invariant.
    const rebuilt = eligibleIds.length > 0
      ? buildGridTree(eligibleIds, gridColumns || undefined)
      : null;
    if (!rebuilt) return;
    window.terminalAPI?.diagLog?.('renderer:reconcile-grid', {
      fromTree: treeIds.length,
      fromMap: eligibleIds.length,
      subsetScope: hasSubsetScope,
    });
    set({ layout: { ...layout, tilingRoot: rebuilt } });
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
      // Immediately move DOM focus and send DEC focus sequences
      // (the useEffect in TerminalPanel is async and causes a race)
      const entry = getTerminalEntry(neighbor);
      if (entry) {
        entry.terminal.focus();
        window.terminalAPI.writePty(focusedTerminalId, '\x1b[O');
        requestAnimationFrame(() => {
          window.terminalAPI.writePty(neighbor, '\x1b[I');
        });
      }
    }
  },

  renameTerminal: (id: TerminalId, title: string, custom?: boolean) => {
    const { terminals } = get();
    const instance = terminals.get(id);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    const updatedInstance = { ...instance, title, customTitle: custom ?? instance.customTitle };
    if (custom) updatedInstance.aiAutoTitle = false;
    newTerminals.set(id, updatedInstance);
    set({ terminals: newTerminals });
    // Propagate custom rename to linked AI session
    if (custom && instance.aiSessionId) {
      get().setSessionNameOverride(instance.aiSessionId, title);
    }
  },

  setTabColor: (id: TerminalId, color: string | undefined) => {
    const { terminals } = get();
    const instance = terminals.get(id);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    newTerminals.set(id, { ...instance, tabColor: color });
    set({ terminals: newTerminals });
  },

  colorizeAllTabs: () => {
    const { terminals, autoColorTabs } = get();
    const newTerminals = new Map(terminals);
    if (autoColorTabs) {
      for (const [id, instance] of newTerminals) {
        newTerminals.set(id, { ...instance, tabColor: undefined });
      }
      set({ terminals: newTerminals, autoColorTabs: false });
    } else {
      // First 4 tabs get Microsoft logo colors (in order), rest are shuffled
      const msColors = TAB_COLORS.slice(0, 4);
      const rest = [...TAB_COLORS.slice(4)].sort(() => Math.random() - 0.5);
      let i = 0;
      for (const [id, instance] of newTerminals) {
        const color = i < 4 ? msColors[i].value : rest[(i - 4) % rest.length].value;
        newTerminals.set(id, { ...instance, tabColor: color });
        i++;
      }
      set({ terminals: newTerminals, autoColorTabs: true });
    }
  },

  toggleSwitcher: () => {
    set((state) => ({ showSwitcher: !state.showSwitcher }));
  },

  togglePaneHints: () => {
    set((state) => ({ showPaneHints: !state.showPaneHints }));
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

  closeSettings: () => {
    set({ showSettings: false });
  },

  updateConfig: async (update: Partial<AppConfig>) => {
    const { config } = get();
    if (!config) return;
    const newConfig = { ...config, ...update };
    for (const [key, value] of Object.entries(update)) {
      await window.terminalAPI.setConfig(key, value);
    }
    if (update.theme || update.backgroundMaterial !== undefined || update.backgroundOpacity !== undefined) {
      const materialActive = newConfig.backgroundMaterial && newConfig.backgroundMaterial !== 'none';
      const opacity = materialActive ? (newConfig.backgroundOpacity ?? 0.8) : undefined;
      applyThemeToChromeVars(newConfig.theme, opacity);
    }
    const extra: Record<string, unknown> = { config: newConfig };
    // Sync store fontSize with config when terminal font size changes
    if (update.terminal?.fontSize) {
      extra.fontSize = update.terminal.fontSize;
    }
    set(extra);
  },

  toggleTabBarPosition: () => {
    const newPos = get().tabBarPosition === 'top' ? 'left' : 'top';
    set({ tabBarPosition: newPos });
    get().updateConfig({ tabBarPosition: newPos } as any);
  },

  setTabBarPosition: (pos: 'top' | 'bottom' | 'left' | 'right') => {
    set({ tabBarPosition: pos });
    get().updateConfig({ tabBarPosition: pos } as any);
  },

  toggleHideTabTitles: () => {
    const val = !get().hideTabTitles;
    set({ hideTabTitles: val });
    get().updateConfig({ hideTabTitles: val } as any);
  },

  toggleHideTabCloseButtons: () => {
    const val = !get().hideTabCloseButtons;
    set({ hideTabCloseButtons: val });
    get().updateConfig({ hideTabCloseButtons: val } as any);
  },

  setTerminalOpacity: (opacity: number) => {
    const clamped = Math.max(0.3, Math.min(1, opacity));
    set({ terminalOpacity: clamped });
    document.documentElement.style.setProperty('--terminal-opacity', String(clamped));
    get().updateConfig({ terminalOpacity: clamped } as any);
  },

  startRenaming: (id: TerminalId | null) => {
    set({ renamingTerminalId: id });
  },

  toggleViewMode: () => {
    const { viewMode, layout, preGridRoot, gridColumns, focusedTerminalId } = get();
    if (viewMode === 'grid') {
      // Grid → Focus: restore the pre-grid layout when available. Defensive
      // guard (#70): if preGridRoot is stale and doesn't contain the currently
      // focused terminal, fall back to the current tilingRoot so focus mode
      // never ends up blank.
      let restored = preGridRoot || layout.tilingRoot;
      if (preGridRoot && focusedTerminalId) {
        const preIds = getLeafOrder(preGridRoot);
        if (!preIds.includes(focusedTerminalId)) {
          restored = layout.tilingRoot;
        }
      }
      set({
        viewMode: 'focus',
        layout: { ...layout, tilingRoot: restored },
        preGridRoot: null,
        gridTabIds: {},
      });
    } else {
      // Focus → Grid: build grid from all non-dormant terminals
      const root = layout.tilingRoot;
      if (!root) {
        set({ viewMode: 'grid' });
        return;
      }
      // Build grid from all tiled terminals in TAB order so the grid panes
      // line up left-to-right, top-to-bottom with the tab bar. Tab order =
      // insertion order of the terminals Map, which TabBar.tsx uses too.
      const ids = Array.from(get().terminals.entries())
        .filter(([, t]) => t.mode === 'tiled')
        .map(([id]) => id);
      if (ids.length === 0) {
        set({ viewMode: 'grid' });
        return;
      }
      const gridRoot = buildGridTree(ids, gridColumns || undefined);
      set({
        viewMode: 'grid',
        preGridRoot: root,
        layout: { ...layout, tilingRoot: gridRoot },
      });
    }
  },

  toggleBroadcastMode: () => {
    set((s) => ({ broadcastMode: !s.broadcastMode }));
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

  gridSelectedTabs: (ids: TerminalId[]) => {
    if (ids.length < 2) return;
    const { layout, preGridRoot } = get();
    const gridRoot = buildGridTree(ids);
    if (!gridRoot) return;
    // Save the original layout so we can restore when exiting grid
    const originalRoot = preGridRoot || layout.tilingRoot;
    const gridIds: Record<string, true> = {};
    for (const id of ids) gridIds[id] = true;
    set({
      viewMode: 'grid',
      preGridRoot: originalRoot,
      layout: { ...layout, tilingRoot: gridRoot },
      gridTabIds: gridIds,
      selectedTerminalIds: {},
      focusedTerminalId: ids[0],
    });
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

  cycleGridColumns: () => {
    const { layout, gridColumns, viewMode, preGridRoot } = get();
    // When already in grid, preserve the grid's current order (which is tab
    // order after the order-matches-tabs fix). When entering grid from focus,
    // fall back to the source tree's leaf order.
    let ids: TerminalId[];
    if (viewMode === 'grid' && layout.tilingRoot) {
      ids = getLeafOrder(layout.tilingRoot);
    } else {
      const sourceRoot = preGridRoot || layout.tilingRoot;
      if (!sourceRoot) return;
      ids = getLeafOrder(sourceRoot);
    }
    const n = ids.length;
    if (n <= 1) return;

    const next = gridColumns + 1;
    const newCols = next > n ? 0 : next;

    // Rebuild grid tree with new column count
    const newGridRoot = buildGridTree(ids, newCols || undefined);

    if (viewMode === 'grid') {
      // Already in grid mode — just replace the tree
      set({
        gridColumns: newCols,
        layout: { ...layout, tilingRoot: newGridRoot },
      });
    } else {
      // Enter grid mode
      set({
        gridColumns: newCols,
        viewMode: 'grid',
        preGridRoot: layout.tilingRoot,
        layout: { ...layout, tilingRoot: newGridRoot },
      });
    }
  },

  moveTerminalDirection: (id: TerminalId, dir: 'up' | 'down' | 'left' | 'right') => {
    const { layout, terminals } = get();
    if (!layout.tilingRoot) return;
    const neighbor = findDirectionalNeighbor(layout.tilingRoot, id, dir);
    if (neighbor) {
      const newRoot = swapLeaves(layout.tilingRoot, id, neighbor);
      // Also swap tab order to keep tab bar in sync with grid positions
      const entries = Array.from(terminals.entries());
      const idxA = entries.findIndex(([tid]) => tid === id);
      const idxB = entries.findIndex(([tid]) => tid === neighbor);
      if (idxA !== -1 && idxB !== -1) {
        [entries[idxA], entries[idxB]] = [entries[idxB], entries[idxA]];
        set({ layout: { ...layout, tilingRoot: newRoot }, terminals: new Map(entries) });
      } else {
        set({ layout: { ...layout, tilingRoot: newRoot } });
      }
    }
  },

  zoomIn: () => {
    const { fontSize } = get();
    const next = Math.min(fontSize + 1, 32);
    set({ fontSize: next });
    // Intentionally not persisting to config.terminal.fontSize: that field is
    // the user-set baseline (Settings dialog) and the denominator of the
    // zoom % shown in the status bar. Writing zoom back there would make the
    // ratio always 1.0 → the status bar would be stuck at 100%.
  },

  zoomOut: () => {
    const { fontSize } = get();
    const next = Math.max(fontSize - 1, 8);
    set({ fontSize: next });
  },

  zoomReset: () => {
    const { config } = get();
    const next = config?.terminal?.fontSize ?? 14;
    set({ fontSize: next });
    // zoomReset restores the config default; no need to write it back
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
    // Only add actual directories, not executable paths or garbled terminal output
    if (/\.(exe|cmd|bat|com|ps1|sh|msi|dll)$/i.test(dir)) return;
    // Reject paths containing ANSI escapes, control chars, shell operators, or command substitution
    if (/[\x1b\x00-\x1f`$]|&&|\|\||[><|'"]|\$\(/.test(dir)) return;
    // Must look like a real path (drive letter, unix root, or WSL UNC path)
    if (!/^[A-Z]:\\/i.test(dir) && !dir.startsWith('/') && !/^\\\\wsl/i.test(dir)) return;
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
    const { focusedTerminalId, terminals } = get();
    if (!focusedTerminalId) return;
    // Use single quotes for POSIX shells to prevent command substitution;
    // double quotes for Windows shells (no $() expansion risk)
    const terminal = terminals.get(focusedTerminalId);
    const isWslOrUnix = terminal?.wsl || dir.startsWith('/');
    const quoted = isWslOrUnix ? `'${dir.replace(/'/g, "'\\''")}'` : `"${dir}"`;
    window.terminalAPI.writePty(focusedTerminalId, `cd ${quoted}\r`);
    get().addRecentDir(dir);
  },

  toggleDirPicker: () => {
    set((state) => ({ showDirPicker: !state.showDirPicker }));
  },

  toggleFileExplorer: () => {
    set((state) => ({ showFileExplorer: !state.showFileExplorer }));
  },

  openFileExplorerAt: (path: string) => {
    // Toggle: if panel is already open, close it. Otherwise open at the path.
    const { showFileExplorer } = get();
    if (showFileExplorer) {
      set({ showFileExplorer: false, fileExplorerTargetPath: null });
    } else {
      set({ showFileExplorer: true, fileExplorerTargetPath: path });
    }
  },

  // ── Worktree panel actions ────────────────────────────────────────
  toggleWorktreePanel: () => {
    const wasShowing = get().showWorktreePanel;
    set({ showWorktreePanel: !wasShowing });
    if (!wasShowing) {
      get().loadWorktrees();
    }
  },

  loadWorktrees: async () => {
    const seq = ++_loadWorktreesSeq;
    const { favoriteDirs, recentDirs } = get();
    const allDirs = [...new Set([...favoriteDirs, ...recentDirs])];
    if (allDirs.length === 0) {
      set({ worktreeRepos: [], worktreeLoading: false });
      return;
    }
    set({ worktreeLoading: true });
    const results = await Promise.allSettled(
      allDirs.map((dir) => window.terminalAPI.listWorktrees(dir)),
    );
    if (seq !== _loadWorktreesSeq) return;
    const oldRepos = get().worktreeRepos;
    const oldExpandState = new Map(oldRepos.map((r) => [r.gitRoot, r.isExpanded]));
    const seenRoots = new Set<string>();
    const repos: RepoWorktrees[] = [];
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const repo = result.value as RepoWorktrees;
      if (!repo.gitRoot || seenRoots.has(repo.gitRoot)) continue;
      seenRoots.add(repo.gitRoot);
      // Only show repos that actually have worktrees. Non-git dirs, missing
      // dirs, or repos with spawn errors are silently skipped — the panel
      // shouldn't surface errors for dirs the user didn't explicitly target.
      if (repo.worktrees.length > 0) {
        const prevExpanded = oldExpandState.get(repo.gitRoot);
        repo.isExpanded = prevExpanded !== undefined ? prevExpanded : true;
        repos.push(repo);
      }
    }
    set({ worktreeRepos: repos, worktreeLoading: false });
  },

  createWorktree: async (repoPath: string, branchName: string, baseBranch: string) => {
    const result = await window.terminalAPI.createWorktree(repoPath, branchName, baseBranch);
    if (result.success) {
      await get().loadWorktrees();
    }
    return result;
  },

  deleteWorktree: async (repoPath: string, worktreePath: string) => {
    const result = await window.terminalAPI.deleteWorktree(repoPath, worktreePath);
    if (result.success) {
      await get().loadWorktrees();
    }
    return result;
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
    // Skip until the store has been hydrated from disk — otherwise an early
    // save would overwrite persisted overrides with empty defaults.
    if (!_sessionHydrated) return;
    const { terminals, layout, favoriteDirs, recentDirs, config, copilotSessions, claudeCodeSessions } = get();

    // For AI sessions, always derive the command from session type to avoid stale
    // startupCommand (e.g. user opened copilot, exited, then started claude manually).
    function getStartupCommand(t: TerminalInstance | undefined): string {
      if (!t) return '';
      if (t.aiSessionId && config) {
        if (!validateSessionId(t.aiSessionId)) return '';
        const isCopilot = copilotSessions.some((s) => s.id === t.aiSessionId);
        if (isCopilot) return buildResumeCommand(config, 'copilot', t.aiSessionId);
        const isClaude = claudeCodeSessions.some((s) => s.id === t.aiSessionId);
        if (isClaude) return buildResumeCommand(config, 'claude-code', t.aiSessionId);
      }
      return t.startupCommand || '';
    }

    function serializeNode(node: LayoutNode): unknown {
      if (node.kind === 'leaf') {
        const t = terminals.get(node.terminalId);
        return { kind: 'leaf', terminal: { title: t?.title ?? 'Terminal', shellProfileId: t?.shellProfileId ?? '', cwd: t?.cwd ?? 'C:\\Users', startupCommand: getStartupCommand(t), aiSessionId: t?.aiSessionId, aiAutoTitle: t?.aiAutoTitle, tabColor: t?.tabColor, customTitle: t?.customTitle, wsl: t?.wsl, wslDistro: t?.wslDistro } };
      }
      return { kind: 'split', direction: node.direction, splitRatio: node.splitRatio, first: serializeNode(node.first), second: serializeNode(node.second) };
    }

    // Merge with cached extras (saved layouts, etc.) — no async load needed
    const data = {
      ..._sessionExtras,
      favoriteDirs,
      recentDirs,
      autoColorTabs: get().autoColorTabs,
      sessionNameOverrides: get().sessionNameOverrides,
      sessionLifecycleOverrides: get().sessionLifecycleOverrides,
      sessionPinned: get().sessionPinned,
      tree: layout.tilingRoot ? serializeNode(layout.tilingRoot) : null,
      floating: layout.floatingPanels.map((p) => {
        const t = terminals.get(p.terminalId);
        return { terminal: { title: t?.title ?? 'Terminal', shellProfileId: t?.shellProfileId ?? '', cwd: t?.cwd ?? 'C:\\Users', startupCommand: getStartupCommand(t), aiSessionId: t?.aiSessionId, aiAutoTitle: t?.aiAutoTitle, tabColor: t?.tabColor, customTitle: t?.customTitle, wsl: t?.wsl, wslDistro: t?.wslDistro }, x: p.x, y: p.y, width: p.width, height: p.height };
      }),
    };
    _sessionExtras = data;
    await window.terminalAPI.saveSession(data);
  },

  restoreSession: async () => {
    const session = (await window.terminalAPI.loadSession()) as Record<string, unknown> | null;
    // Flip the hydration flag whether or not a saved session exists —
    // subsequent saveSession calls are safe either way.
    _sessionHydrated = true;
    if (!session) return false;
    // Cache session extras (layouts, etc.) so saveSession doesn't need async load
    _sessionExtras = { ...session };

    if (typeof session.autoColorTabs === 'boolean') {
      set({ autoColorTabs: session.autoColorTabs });
    }

    if (session.sessionNameOverrides && typeof session.sessionNameOverrides === 'object') {
      set({ sessionNameOverrides: session.sessionNameOverrides as Record<string, string> });
    }

    if (session.sessionLifecycleOverrides && typeof session.sessionLifecycleOverrides === 'object') {
      set({ sessionLifecycleOverrides: session.sessionLifecycleOverrides as Record<string, import('../../shared/copilot-types').SessionLifecycle> });
    }

    if (session.sessionPinned && typeof session.sessionPinned === 'object') {
      set({ sessionPinned: session.sessionPinned as Record<string, true> });
    }

    const { config } = get();
    if (!config) return false;

    // New tree format
    if (session.tree || session.floating) {
      async function createTerm(info: { title: string; shellProfileId: string; cwd: string; startupCommand?: string; aiSessionId?: string; aiAutoTitle?: boolean; tabColor?: string; customTitle?: boolean; wsl?: boolean; wslDistro?: string }): Promise<{ id: TerminalId; instance: TerminalInstance } | null> {
        const profile = config!.shells.find((s) => s.id === info.shellProfileId) ?? config!.shells[0];
        if (!profile) return null;
        const id = uuidv4();
        // Sanitize cwd: skip executable paths that were incorrectly saved as cwd
        let cwd = info.cwd || '';
        if (/\.(exe|cmd|bat|com|ps1|sh|msi|dll)$/i.test(cwd) || !cwd) {
          cwd = profile.cwd || ((window as any).platformInfo?.platform === 'win32' ? 'C:\\Users' : (window as any).platformInfo?.homeDir || '/');
        }
        try {
          const { pid } = await window.terminalAPI.createPty({
            id, shellPath: profile.path, args: profile.args, cwd, env: profile.env, cols: 80, rows: 24,
            wslDistro: info.wsl ? info.wslDistro : undefined,
          });
          return { id, instance: { id, title: info.title || profile.name, customTitle: info.customTitle ?? !!info.title, shellProfileId: profile.id, cwd, mode: 'tiled' as const, pid, lastProcess: '', startupCommand: info.startupCommand || '', aiSessionId: info.aiSessionId, aiAutoTitle: info.aiAutoTitle, tabColor: info.tabColor, wsl: info.wsl, wslDistro: info.wslDistro } };
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

  // ── Prompts dialog actions ─────────────────────────────────────────
  showPromptsForTerminal: (terminalId: TerminalId) => {
    set({ promptsDialogRequest: { terminalId } });
  },
  clearPromptsDialogRequest: () => {
    set({ promptsDialogRequest: null });
  },
  showSessionSummary: (sessionId: string) => {
    set({ sessionSummaryRequest: sessionId });
  },
  clearSessionSummary: () => {
    set({ sessionSummaryRequest: null });
  },

  // ── Copilot panel actions ──────────────────────────────────────────
  toggleCopilotPanel: () => {
    set((s) => ({ showCopilotPanel: !s.showCopilotPanel }));
  },

  loadCopilotSessions: async () => {
    const sessions = await (window.terminalAPI as any).listCopilotSessions();
    set({ copilotSessions: sessions ?? [] });
  },

  searchCopilotSessions: async (query: string) => {
    set({ copilotSearchQuery: query });
    if (!query.trim()) {
      const sessions = await (window.terminalAPI as any).listCopilotSessions();
      set({ copilotSessions: sessions ?? [] });
      return;
    }
    const sessions = await (window.terminalAPI as any).searchCopilotSessions(query);
    set({ copilotSessions: sessions ?? [] });
  },

  openCopilotSession: async (sessionId: string) => {
    await openAiSession(sessionId, 'copilot', get, set);
  },

  setCopilotSessions: (sessions: CopilotSessionSummary[]) => {
    set({ copilotSessions: sessions });
  },

  updateTerminalTitleFromSession: (session: CopilotSessionSummary, _sessionType?: 'copilot' | 'claude') => {
    if (!session.summary) return;
    const { terminals, focusedTerminalId } = get();
    const newTerminals = new Map(terminals);
    let changed = false;

    // Check if any terminal already has this session linked
    let alreadyLinked = false;
    for (const [, instance] of terminals) {
      if (instance.aiSessionId === session.id) {
        alreadyLinked = true;
        break;
      }
    }

    // Auto-link: pick at most one unlinked terminal as the candidate for
    // this session. We used to gate on a process-name match (looking for
    // 'copilot' / 'claude' / 'cc' in the OSC-set title), but that misses
    // wrappers like ag.bat, ghcp, claude --resume via npx, custom aliases,
    // and anything else that doesn't broadcast its agent-ness through a
    // terminal title. cwd is far more reliable: AI session files always
    // record the cwd they were started from.
    //
    // The recency guard is the safety net: we only auto-link when the
    // session has had activity in the last 10 minutes, so opening a fresh
    // pwsh in C:\projects\tmax doesn't get retroactively attached to a
    // months-old session in the same folder.
    const normCwd = (p: string) => p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
    // Auto-link gate: the session must currently be active. Status is
    // 'idle' once nothing has happened for 30s, so an actively-running
    // agent (in this window or another tmax instance) keeps a non-idle
    // status and attaches to a matching-cwd terminal here. A long-quiet
    // session can't poach a fresh pwsh you just opened.
    const sessionActive = session.status !== 'idle';

    let candidateId: string | null = null;
    if (!alreadyLinked && session.cwd && sessionActive) {
      const sessionCwd = normCwd(session.cwd);
      const eligible: string[] = [];
      for (const [id, t] of terminals) {
        if (t.aiSessionId) continue;
        if (t.mode !== 'tiled' && t.mode !== 'floating') continue;
        if (normCwd(t.cwd) !== sessionCwd) continue;
        eligible.push(id);
      }
      if (eligible.length > 0) {
        // Prefer the focused terminal when it's eligible - that's almost
        // always the one the user just typed `ag` / `claude` / `ghcp` in.
        candidateId = focusedTerminalId && eligible.includes(focusedTerminalId)
          ? focusedTerminalId
          : eligible[0];
      }
    }

    for (const [id, inst] of terminals) {
      let current = inst;
      let matched = current.aiSessionId === session.id;

      if (!matched && id === candidateId) {
        current = { ...current, aiSessionId: session.id, aiAutoTitle: !current.customTitle, customTitle: true };
        newTerminals.set(id, current);
        matched = true;
        changed = true;
      }

      if (matched && current.aiAutoTitle) {
        // Strip XML/HTML tags from summary (e.g. slash command markup)
        const clean = session.summary.replace(/<[^>]+>/g, '').trim();
        const summary = clean.length > 60 ? clean.slice(0, 57) + '...' : clean;
        const title = summary || current.title;
        if (current.title !== title) {
          newTerminals.set(id, { ...newTerminals.get(id)!, title });
          changed = true;
        }
      }
    }
    if (changed) set({ terminals: newTerminals });
  },

  addCopilotSession: (session: CopilotSessionSummary) => {
    set((s) => ({
      copilotSessions: [...s.copilotSessions.filter((x) => x.id !== session.id), session],
    }));
    get().updateTerminalTitleFromSession(session, 'copilot');
  },

  updateCopilotSession: (session: CopilotSessionSummary) => {
    const oldSession = get().copilotSessions.find((x) => x.id === session.id);
    set((s) => ({
      copilotSessions: s.copilotSessions.map((x) => (x.id === session.id ? session : x)),
    }));
    get().updateTerminalTitleFromSession(session, 'copilot');
    // Auto-reactivate only if session has a linked terminal in tmax
    const lifecycle = get().sessionLifecycleOverrides[session.id];
    if ((lifecycle === 'completed' || lifecycle === 'old') && oldSession) {
      const hasLinkedTerminal = [...get().terminals.values()].some((t) => t.aiSessionId === session.id);
      if (hasLinkedTerminal) {
        const hasNewActivity = session.status !== 'idle' || session.messageCount > oldSession.messageCount;
        if (hasNewActivity) {
          get().setSessionLifecycle(session.id, 'active');
          const name = get().sessionNameOverrides[session.id] || session.summary || session.id.slice(0, 8);
          get().addToast(`"${name}" moved back to Active`);
        }
      }
    }
  },

  removeCopilotSession: (sessionId: string) => {
    set((s) => ({
      copilotSessions: s.copilotSessions.filter((x) => x.id !== sessionId),
      selectedCopilotSessionId: s.selectedCopilotSessionId === sessionId ? null : s.selectedCopilotSessionId,
    }));
  },

  // ── Claude Code session actions ────────────────────────────────────
  loadClaudeCodeSessions: async () => {
    const sessions = await (window.terminalAPI as any).listClaudeCodeSessions();
    set({ claudeCodeSessions: sessions ?? [] });
  },

  searchClaudeCodeSessions: async (query: string) => {
    if (!query.trim()) {
      const sessions = await (window.terminalAPI as any).listClaudeCodeSessions();
      set({ claudeCodeSessions: sessions ?? [] });
      return;
    }
    const sessions = await (window.terminalAPI as any).searchClaudeCodeSessions(query);
    set({ claudeCodeSessions: sessions ?? [] });
  },

  openClaudeCodeSession: async (sessionId: string) => {
    await openAiSession(sessionId, 'claude-code', get, set);
  },

  addClaudeCodeSession: (session: CopilotSessionSummary) => {
    set((s) => ({
      claudeCodeSessions: [...s.claudeCodeSessions.filter((x) => x.id !== session.id), session],
    }));
    get().updateTerminalTitleFromSession(session, 'claude');
  },

  updateClaudeCodeSession: (session: CopilotSessionSummary) => {
    const oldSession = get().claudeCodeSessions.find((x) => x.id === session.id);
    set((s) => ({
      claudeCodeSessions: s.claudeCodeSessions.map((x) => (x.id === session.id ? session : x)),
    }));
    get().updateTerminalTitleFromSession(session, 'claude');
    // Auto-reactivate only if session has a linked terminal in tmax
    const lifecycle = get().sessionLifecycleOverrides[session.id];
    if ((lifecycle === 'completed' || lifecycle === 'old') && oldSession) {
      const hasLinkedTerminal = [...get().terminals.values()].some((t) => t.aiSessionId === session.id);
      if (hasLinkedTerminal) {
        const hasNewActivity = session.status !== 'idle' || session.messageCount > oldSession.messageCount;
        if (hasNewActivity) {
          get().setSessionLifecycle(session.id, 'active');
          const name = get().sessionNameOverrides[session.id] || session.summary || session.id.slice(0, 8);
          get().addToast(`"${name}" moved back to Active`);
        }
      }
    }
  },

  removeClaudeCodeSession: (sessionId: string) => {
    set((s) => ({
      claudeCodeSessions: s.claudeCodeSessions.filter((x) => x.id !== sessionId),
    }));
  },

  setSessionNameOverride: (sessionId: string, name: string) => {
    set((s) => {
      // Also sync the terminal pane/tab title for any terminal linked to this session
      const updatedTerminals = new Map(s.terminals);
      for (const [id, inst] of updatedTerminals) {
        if (inst.aiSessionId === sessionId) {
          updatedTerminals.set(id, { ...inst, title: name, customTitle: true, aiAutoTitle: false });
        }
      }
      return {
        sessionNameOverrides: { ...s.sessionNameOverrides, [sessionId]: name },
        terminals: updatedTerminals,
      };
    });
    // Persist immediately — beforeunload often doesn't complete before renderer shutdown
    get().saveSession();
  },

  setSessionLifecycle: (sessionId: string, lifecycle: import('../../shared/copilot-types').SessionLifecycle) => {
    set((s) => ({
      sessionLifecycleOverrides: { ...s.sessionLifecycleOverrides, [sessionId]: lifecycle },
    }));
    get().saveSession();
  },

  togglePinSession: (sessionId: string) => {
    set((s) => {
      const next = { ...s.sessionPinned };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      return { sessionPinned: next };
    });
    get().saveSession();
  },

  checkStaleActiveSessions: () => {
    const { copilotSessions, claudeCodeSessions, sessionLifecycleOverrides, config } = get();
    const days = (config as any)?.oldSessionDays ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const allSessions = [...copilotSessions, ...claudeCodeSessions];
    const updates: Record<string, import('../../shared/copilot-types').SessionLifecycle> = {};
    for (const s of allSessions) {
      const current = sessionLifecycleOverrides[s.id];
      if (current === 'completed') continue;
      if (!current || current === 'active') {
        if (s.lastActivityTime && s.lastActivityTime < cutoff) {
          updates[s.id] = 'old';
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      set((st) => ({
        sessionLifecycleOverrides: { ...st.sessionLifecycleOverrides, ...updates },
      }));
      get().saveSession();
    }
  },

  addToast: (message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      toastNotifications: [...s.toastNotifications, { id, message, timestamp: Date.now() }],
    }));
    setTimeout(() => {
      set((s) => ({
        toastNotifications: s.toastNotifications.filter((t) => t.id !== id),
      }));
    }, 5000);
  },

  dismissToast: (id: string) => {
    set((s) => ({
      toastNotifications: s.toastNotifications.filter((t) => t.id !== id),
    }));
  },

  resumeAllSessions: () => {
    const { terminals, config, copilotSessions, claudeCodeSessions } = get();
    if (!config) return;
    for (const [id, t] of terminals) {
      if (!t.aiSessionId && !t.startupCommand) continue;
      let cmd = t.startupCommand;
      if (!cmd && t.aiSessionId) {
        if (!validateSessionId(t.aiSessionId)) continue;
        const isCopilot = copilotSessions.some((s) => s.id === t.aiSessionId);
        if (isCopilot) {
          cmd = buildResumeCommand(config, 'copilot', t.aiSessionId);
        } else {
          const isClaude = claudeCodeSessions.some((s) => s.id === t.aiSessionId);
          if (isClaude) {
            cmd = buildResumeCommand(config, 'claude-code', t.aiSessionId);
          }
        }
      }
      if (cmd) {
        window.terminalAPI.writePty(id, cmd + '\r');
      }
    }
  },

  // ── Tab group actions ────────────────────────────────────────────
  createTabGroup: (name: string, color: string) => {
    const id = uuidv4();
    const newGroups = new Map(get().tabGroups);
    newGroups.set(id, { id, name, color, collapsed: false });
    set({ tabGroups: newGroups });
    return id;
  },

  deleteTabGroup: (groupId: string) => {
    const { terminals, tabGroups } = get();
    const newGroups = new Map(tabGroups);
    newGroups.delete(groupId);
    const newTerminals = new Map(terminals);
    for (const [id, t] of newTerminals) {
      if (t.groupId === groupId) {
        newTerminals.set(id, { ...t, groupId: undefined });
      }
    }
    set({ tabGroups: newGroups, terminals: newTerminals });
  },

  renameTabGroup: (groupId: string, name: string) => {
    const { tabGroups } = get();
    const group = tabGroups.get(groupId);
    if (!group) return;
    const newGroups = new Map(tabGroups);
    newGroups.set(groupId, { ...group, name });
    set({ tabGroups: newGroups });
  },

  toggleTabGroupCollapse: (groupId: string) => {
    const { tabGroups } = get();
    const group = tabGroups.get(groupId);
    if (!group) return;
    const newGroups = new Map(tabGroups);
    newGroups.set(groupId, { ...group, collapsed: !group.collapsed });
    set({ tabGroups: newGroups });
  },

  addToGroup: (terminalId: TerminalId, groupId: string) => {
    const { terminals } = get();
    const instance = terminals.get(terminalId);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    newTerminals.set(terminalId, { ...instance, groupId });
    set({ terminals: newTerminals });
  },

  removeFromGroup: (terminalId: TerminalId) => {
    const { terminals } = get();
    const instance = terminals.get(terminalId);
    if (!instance) return;
    const newTerminals = new Map(terminals);
    newTerminals.set(terminalId, { ...instance, groupId: undefined });
    set({ terminals: newTerminals });
  },

  // ── Diff review actions ───────────────────────────────────────────
  openDiffReview: (terminalId: TerminalId) => {
    set({ diffReviewOpen: true, diffReviewTerminalId: terminalId, diffReviewMode: 'unstaged' });
  },
  closeDiffReview: () => {
    set({ diffReviewOpen: false, diffReviewTerminalId: null });
  },
  setDiffReviewMode: (mode: DiffMode) => {
    set({ diffReviewMode: mode });
  },
}));
