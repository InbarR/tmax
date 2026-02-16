import { useEffect } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { SplitDirection } from '../state/types';

interface KeyCombo {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}

function parseKeyCombo(combo: string): KeyCombo {
  // Handle special cases: "Ctrl+=" ends with "+" then "=" which splits oddly
  // Also "Ctrl+-" and "Ctrl+Shift+/" need care
  const ctrlKey = /\bctrl\b/i.test(combo);
  const shiftKey = /\bshift\b/i.test(combo);
  const altKey = /\balt\b/i.test(combo);

  // Extract the actual key: everything after the last modifier+
  let key = combo;
  key = key.replace(/\b(ctrl|shift|alt)\s*\+\s*/gi, '');
  key = key.toLowerCase().trim();

  // Normalize common key names
  if (key === '') key = '+'; // "Ctrl+Shift++" edge case

  return { ctrlKey, shiftKey, altKey, key };
}

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  // event.key for arrows is "ArrowRight" etc, normalize both sides
  const eventKey = event.key.toLowerCase();
  return (
    event.ctrlKey === combo.ctrlKey &&
    event.shiftKey === combo.shiftKey &&
    event.altKey === combo.altKey &&
    eventKey === combo.key
  );
}

const DEFAULT_BINDINGS: Record<string, string> = {
  'Ctrl+Shift+N': 'createTerminal',
  'Ctrl+Shift+W': 'closeTerminal',
  'Shift+ArrowUp': 'focusUp',
  'Shift+ArrowDown': 'focusDown',
  'Shift+ArrowLeft': 'focusLeft',
  'Shift+ArrowRight': 'focusRight',
  'Ctrl+Shift+ArrowRight': 'moveRight',
  'Ctrl+Shift+ArrowDown': 'moveDown',
  'Ctrl+Shift+ArrowLeft': 'moveLeft',
  'Ctrl+Shift+ArrowUp': 'moveUp',
  'Ctrl+=': 'zoomIn',
  'Ctrl+-': 'zoomOut',
  'Ctrl+0': 'zoomReset',
  'Ctrl+Shift+F': 'toggleFocusMode',
  'Ctrl+Shift+H': 'toggleDormant',
  'Ctrl+Shift+E': 'equalizeLayout',
  'Ctrl+,': 'openSettings',
  'Ctrl+Shift+R': 'renameTerminal',
  'Ctrl+Shift+/': 'showShortcuts',
  'Ctrl+Shift+G': 'switchTerminal',
  'Ctrl+Shift+D': 'dirPicker',
  'Ctrl+Shift+P': 'commandPalette',
  'Ctrl+Tab': 'focusNext',
  'Ctrl+Shift+Tab': 'focusPrev',
  'Ctrl+Alt+ArrowUp': 'splitVerticalUp',
  'Ctrl+Alt+ArrowDown': 'splitVertical',
  'Ctrl+Alt+ArrowLeft': 'splitHorizontalLeft',
  'Ctrl+Alt+ArrowRight': 'splitHorizontal',
  'Ctrl+Shift+Alt+ArrowUp': 'resizeUp',
  'Ctrl+Shift+Alt+ArrowDown': 'resizeDown',
  'Ctrl+Shift+Alt+ArrowLeft': 'resizeLeft',
  'Ctrl+Shift+Alt+ArrowRight': 'resizeRight',
};

export function useKeybindings(): void {
  const config = useTerminalStore((s) => s.config);

  useEffect(() => {
    // Start with hardcoded defaults, then overlay config bindings
    // This ensures new shortcuts always work even if config is stale
    const mergedBindings: Record<string, string> = { ...DEFAULT_BINDINGS };

    const configBindings = config?.keybindings;
    if (Array.isArray(configBindings)) {
      // Config array format: clear defaults for actions that config defines, then apply
      const configActions = new Set(configBindings.map((b: { action: string }) => b.action));
      for (const [key, action] of Object.entries(mergedBindings)) {
        if (configActions.has(action)) delete mergedBindings[key];
      }
      for (const b of configBindings as { action: string; key: string }[]) {
        mergedBindings[b.key] = b.action;
      }
    }

    const parsedBindings = Object.entries(mergedBindings).map(([combo, action]) => ({
      combo: parseKeyCombo(combo),
      action,
    }));

    // Sort bindings: more modifiers first so Ctrl+Shift+X matches before Shift+X
    parsedBindings.sort((a, b) => {
      const modCount = (c: KeyCombo) => +c.ctrlKey + +c.shiftKey + +c.altKey;
      return modCount(b.combo) - modCount(a.combo);
    });

    function handleKeyDown(event: KeyboardEvent): void {
      for (const { combo, action } of parsedBindings) {
        if (matchesCombo(event, combo)) {
          event.preventDefault();
          event.stopPropagation();
          dispatchAction(action);
          return;
        }
      }
    }

    // Use document capture to intercept before xterm.js textarea
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [config]);
}

function dispatchAction(action: string): void {
  const store = useTerminalStore.getState();
  const focusedId = store.focusedTerminalId;

  switch (action) {
    case 'createTerminal':
      store.createTerminal();
      break;
    case 'closeTerminal':
      if (focusedId) store.closeTerminal(focusedId);
      break;
    case 'focusNext':
      store.focusNext();
      break;
    case 'focusPrev':
      store.focusPrev();
      break;
    case 'focusUp':
      store.focusDirection('up');
      break;
    case 'focusDown':
      store.focusDirection('down');
      break;
    case 'focusLeft':
      store.focusDirection('left');
      break;
    case 'focusRight':
      store.focusDirection('right');
      break;
    case 'splitHorizontal':
      if (focusedId) store.splitTerminal(focusedId, 'horizontal' as SplitDirection, undefined, 'right');
      break;
    case 'splitHorizontalLeft':
      if (focusedId) store.splitTerminal(focusedId, 'horizontal' as SplitDirection, undefined, 'left');
      break;
    case 'splitVertical':
      if (focusedId) store.splitTerminal(focusedId, 'vertical' as SplitDirection, undefined, 'bottom');
      break;
    case 'splitVerticalUp':
      if (focusedId) store.splitTerminal(focusedId, 'vertical' as SplitDirection, undefined, 'top');
      break;
    case 'toggleFloat':
      if (focusedId) {
        const terminal = store.terminals.get(focusedId);
        if (terminal?.mode === 'tiled') {
          store.moveToFloat(focusedId);
        } else if (terminal?.mode === 'floating') {
          store.moveToTiling(focusedId);
        }
      }
      break;
    case 'switchTerminal':
      store.toggleSwitcher();
      break;
    case 'renameTerminal':
      if (focusedId) store.startRenaming(focusedId);
      break;
    case 'zoomIn':
      store.zoomIn();
      break;
    case 'zoomOut':
      store.zoomOut();
      break;
    case 'zoomReset':
      store.zoomReset();
      break;
    case 'showShortcuts':
      store.toggleShortcuts();
      break;
    case 'openSettings':
      store.toggleSettings();
      break;
    case 'dirPicker':
      store.toggleDirPicker();
      break;
    case 'equalizeLayout':
      store.equalizeLayout();
      break;
    case 'toggleFocusMode':
      store.toggleFocusMode();
      break;
    case 'toggleDormant':
      if (focusedId) {
        const t = store.terminals.get(focusedId);
        if (t?.mode === 'dormant') {
          store.wakeFromDormant(focusedId);
        } else {
          store.moveToDormant(focusedId);
        }
      }
      break;
    case 'commandPalette':
      store.toggleCommandPalette();
      break;
    case 'moveUp':
    case 'moveDown':
    case 'moveLeft':
    case 'moveRight': {
      if (!focusedId) break;
      const moveDir = action.replace('move', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
      store.moveTerminalDirection(focusedId, moveDir);
      break;
    }
    case 'resizeUp':
    case 'resizeDown':
    case 'resizeLeft':
    case 'resizeRight': {
      if (!focusedId) break;
      const direction = action.replace('resize', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
      const delta = direction === 'up' || direction === 'left' ? -5 : 5;
      adjustFocusedSplitRatio(store, focusedId, direction, delta);
      break;
    }
  }
}

function adjustFocusedSplitRatio(
  store: ReturnType<typeof useTerminalStore.getState>,
  terminalId: string,
  direction: 'up' | 'down' | 'left' | 'right',
  delta: number
): void {
  const root = store.layout.tilingRoot;
  if (!root || root.kind === 'leaf') return;

  const splitDirection: SplitDirection =
    direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';

  function findParentSplit(
    node: typeof root,
    targetId: string
  ): { id: string; ratio: number } | null {
    if (!node || node.kind === 'leaf') return null;
    if (node.direction === splitDirection) {
      if (containsTerminal(node.first, targetId) || containsTerminal(node.second, targetId)) {
        return { id: node.id, ratio: node.splitRatio };
      }
    }
    const fromFirst = findParentSplit(node.first, targetId);
    if (fromFirst) return fromFirst;
    return findParentSplit(node.second, targetId);
  }

  function containsTerminal(
    node: typeof root,
    targetId: string
  ): boolean {
    if (!node) return false;
    if (node.kind === 'leaf') return node.terminalId === targetId;
    return containsTerminal(node.first, targetId) || containsTerminal(node.second, targetId);
  }

  const parent = findParentSplit(root, terminalId);
  if (parent) {
    const newRatio = Math.max(0.1, Math.min(0.9, parent.ratio + delta / 100));
    store.setSplitRatio(parent.id, newRatio);
  }
}
