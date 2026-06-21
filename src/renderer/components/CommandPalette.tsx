import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { formatKeyForPlatform, isMac } from '../utils/platform';
import { DEFAULT_BINDINGS } from '../hooks/useKeybindings';
import { tokenizeAnd, matchesAllTokens } from '../../shared/and-filter';
import { getTerminalEntry } from '../terminal-registry';
import { MOUSE_RESET_SEQUENCE, TERMINAL_RECOVER_SEQUENCE } from '../utils/terminal-recover';
import InputDialog from './InputDialog';
import { confirmDialog } from './AppDialog';

// Re-export so existing importers keep working (the sequences now live in
// utils/terminal-recover so they can be unit-tested without pulling in React).
export { MOUSE_RESET_SEQUENCE, TERMINAL_RECOVER_SEQUENCE };

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

// Palette command id -> keybinding action (useKeybindings.ts). Most palette
// ids match the binding action name 1:1, but several diverge (the palette id
// describes the menu entry, the action drives dispatchAction). Only ids that
// resolve to a bindable action get a "Change shortcut" right-click option;
// commands with no entry here AND no matching action are not rebindable.
const PALETTE_ID_TO_ACTION: Record<string, string> = {
  newTerminal: 'createTerminal',
  jumpToTerminal: 'switchTerminalList',
  paneHints: 'switchTerminal',
  toggleViewMode: 'toggleFocusMode',
  toggleDormant: 'toggleDormant',
  equalize: 'equalizeLayout',
  copilotSessions: 'copilotPanel',
  worktreePanel: 'worktreePanel',
  dirPicker: 'dirPicker',
  colorizeAllTabs: 'colorizeAllTabs',
  hideTabBar: 'hideTabBar',
  fileExplorer: 'fileExplorer',
  jumpToPrompt: 'showPrompts',
  promptComposer: 'promptComposer',
  searchPrompts: 'searchPrompts',
  toggleTranscript: 'toggleTranscript',
  shortcuts: 'showShortcuts',
  settings: 'openSettings',
  backlog: 'openBacklog',
  splitRight: 'splitHorizontal',
  splitLeft: 'splitHorizontalLeft',
  splitDown: 'splitVertical',
  splitUp: 'splitVerticalUp',
};

// Friendly names for bindable actions that have no palette row (so the rebind
// conflict dialog reads "...assigned to Command Palette" not "...commandPalette").
const ACTION_LABELS: Record<string, string> = {
  commandPalette: 'Command Palette',
};

// Resolve a palette command to its bindable keybinding action, or null if the
// command can't be rebound. Falls back to the id when it's already a known
// action name (so future palette entries that match an action work for free).
function actionForCommandId(id: string): string | null {
  const mapped = PALETTE_ID_TO_ACTION[id];
  if (mapped) return mapped;
  const isKnownAction =
    Object.values(DEFAULT_BINDINGS).includes(id) || id === 'commandPalette';
  return isKnownAction ? id : null;
}

const CommandPalette: React.FC = () => {
  const show = useTerminalStore((s) => s.showCommandPalette);
  // Subscribe to the focused pane's aiSessionId so commands that only make
  // sense for an AI session (Prompt Editor, etc.) can be filtered out
  // when the user has a plain shell focused.
  const focusedAiSessionId = useTerminalStore((s) => {
    const id = s.focusedTerminalId;
    return id ? s.terminals.get(id)?.aiSessionId ?? null : null;
  });
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dialog, setDialog] = useState<{ title: string; placeholder?: string; options?: string[]; onSubmit: (value: string) => void } | null>(null);
  // TASK-193: action currently being re-recorded via right-click "Change
  // shortcut". null = not recording.
  const [rebindingAction, setRebindingAction] = useState<string | null>(null);
  // Right-click context menu for a palette command (rebind / reset).
  const [rebindMenu, setRebindMenu] = useState<{ x: number; y: number; cmd: Command; action: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo((): Command[] => {
    const store = useTerminalStore.getState;
    const focusedId = () => store().focusedTerminalId;

    return [
      { id: 'newTerminal', label: 'New Terminal', shortcut: 'Ctrl+Shift+N', action: () => store().createTerminal() },
      { id: 'closeTerminal', label: 'Close Terminal', shortcut: 'Ctrl+Shift+W', action: () => { const id = focusedId(); if (id) store().closeTerminal(id); } },
      { id: 'restoreClosedTerminal', label: 'Reopen Closed Pane', shortcut: 'Ctrl+Shift+T', action: () => store().restoreClosedTerminal() },
      { id: 'renameTerminal', label: 'Rename Terminal', shortcut: 'Ctrl+Shift+R', action: () => { const id = focusedId(); if (id) store().startRenaming(id); } },
      { id: 'refreshPane', label: 'Refresh Pane', shortcut: 'Ctrl+Alt+R', action: () => { const id = focusedId(); if (id) store().refreshTerminal(id); } },
      { id: 'replaceTerminal', label: 'New Terminal in Place', shortcut: 'Ctrl+Alt+N', action: () => { const id = focusedId(); if (id) store().replaceTerminal(id); } },
      { id: 'jumpToTerminal', label: 'Jump to Terminal', shortcut: 'Ctrl+Shift+G', action: () => store().toggleSwitcher() },
      { id: 'paneHints', label: 'Jump to Terminal by Hint', shortcut: 'Ctrl+Shift+J', action: () => store().togglePaneHints() },
      { id: 'tabMenu', label: 'Open Tab Menu', shortcut: 'Ctrl+Shift+M', action: () => store().openTabMenu() },
      { id: 'focusNext', label: 'Focus Next Terminal', shortcut: 'Ctrl+Tab', action: () => store().focusNext() },
      { id: 'focusPrev', label: 'Focus Previous Terminal', shortcut: 'Ctrl+Shift+Tab', action: () => store().focusPrev() },
      { id: 'splitRight', label: 'Split Right', shortcut: 'Ctrl+Alt+\u2192', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'horizontal', undefined, 'right'); } },
      { id: 'splitDown', label: 'Split Down', shortcut: 'Ctrl+Alt+\u2193', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'vertical', undefined, 'bottom'); } },
      { id: 'splitLeft', label: 'Split Left', shortcut: 'Ctrl+Alt+\u2190', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'horizontal', undefined, 'left'); } },
      { id: 'splitUp', label: 'Split Up', shortcut: 'Ctrl+Alt+\u2191', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'vertical', undefined, 'top'); } },
      { id: 'toggleViewMode', label: 'Toggle View Mode (Focus / Grid)', shortcut: 'Ctrl+Shift+F', action: () => store().toggleViewMode() },
      // TASK-72: pane multi-select filter. Pair these two commands so they
      // surface together in the palette - users discover Show all when they
      // need to undo Show selected.
      { id: 'showSelectedPanes', label: 'Show Selected Panes (filter to multi-selected)', action: () => store().showSelectedPanes() },
      { id: 'showAllPanes', label: 'Show All Panes (clear selected-only filter)', action: () => store().showAllPanes() },
      { id: 'clearPaneSelection', label: 'Clear Pane Selection', action: () => store().clearSelection() },
      { id: 'toggleBroadcastMode', label: 'Toggle Broadcast Input to All Panes', shortcut: 'Ctrl+Shift+A', action: () => store().toggleBroadcastMode() },
      { id: 'cycleGridColumns', label: 'Cycle Grid Layout', shortcut: 'Ctrl+Shift+L', action: () => store().cycleGridColumns() },
      { id: 'toggleDormant', label: 'Toggle Hide (Dormant)', shortcut: 'Ctrl+Shift+H', action: () => { const id = focusedId(); if (id) { const t = store().terminals.get(id); if (t?.mode === 'dormant') store().wakeFromDormant(id); else store().moveToDormant(id); } } },
      { id: 'equalize', label: 'Equalize Pane Sizes', shortcut: 'Ctrl+Shift+E', action: () => store().equalizeLayout() },
      { id: 'zoomIn', label: 'Zoom In', shortcut: 'Ctrl++', action: () => store().zoomIn() },
      { id: 'zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => store().zoomOut() },
      { id: 'zoomReset', label: 'Reset Zoom', shortcut: 'Ctrl+0', action: () => store().zoomReset() },
      { id: 'focusUp', label: 'Focus Up', shortcut: 'Shift+\u2191', action: () => store().focusDirection('up') },
      { id: 'focusDown', label: 'Focus Down', shortcut: 'Shift+\u2193', action: () => store().focusDirection('down') },
      { id: 'focusLeft', label: 'Focus Left', shortcut: 'Shift+\u2190', action: () => store().focusDirection('left') },
      { id: 'focusRight', label: 'Focus Right', shortcut: 'Shift+\u2192', action: () => store().focusDirection('right') },
      { id: 'moveUp', label: 'Move Terminal Up', shortcut: 'Ctrl+Shift+\u2191', action: () => { const id = focusedId(); if (id) store().moveTerminalDirection(id, 'up'); } },
      { id: 'moveDown', label: 'Move Terminal Down', shortcut: 'Ctrl+Shift+\u2193', action: () => { const id = focusedId(); if (id) store().moveTerminalDirection(id, 'down'); } },
      { id: 'moveLeft', label: 'Move Terminal Left', shortcut: 'Ctrl+Shift+\u2190', action: () => { const id = focusedId(); if (id) store().moveTerminalDirection(id, 'left'); } },
      { id: 'moveRight', label: 'Move Terminal Right', shortcut: 'Ctrl+Shift+\u2192', action: () => { const id = focusedId(); if (id) store().moveTerminalDirection(id, 'right'); } },
      { id: 'setStartupCmd', label: 'Set Startup Command for Current Terminal', action: () => {
        const id = store().focusedTerminalId;
        if (!id) return;
        const t = store().terminals.get(id);
        setDialog({ title: 'Startup Command', placeholder: t?.startupCommand || 'e.g. npm run dev', onSubmit: (cmd) => {
          const terminals = new Map(store().terminals);
          const term = terminals.get(id);
          if (term) { terminals.set(id, { ...term, startupCommand: cmd }); useTerminalStore.setState({ terminals }); }
          setDialog(null);
        }});
      }},
      { id: 'copilotSessions', label: 'Copilot Sessions Panel', shortcut: 'Ctrl+Shift+C', action: () => store().toggleCopilotPanel() },
      { id: 'worktreePanel', label: 'Git Worktree Panel', action: () => store().toggleWorktreePanel() },
      { id: 'dirPicker', label: 'Go to Directory (Favorites & Recent)', shortcut: 'Ctrl+Shift+D', action: () => store().toggleDirPicker() },
      { id: 'colorizeAllTabs', label: 'Toggle Tab Colors', shortcut: 'Ctrl+Shift+O', action: () => store().colorizeAllTabs() },
      { id: 'toggleTabBar', label: 'Toggle Tab Bar: Top / Left', action: () => store().toggleTabBarPosition() },
      { id: 'hideTabBar', label: 'Hide / Show Tab Bar', shortcut: 'Ctrl+Shift+B', action: () => store().toggleHideTabTitles() },
      { id: 'fileExplorer', label: 'File Explorer', shortcut: 'Ctrl+Shift+X', action: () => store().toggleFileExplorer() },
      { id: 'refocus', label: 'Re-focus Terminal (fix stuck input)', action: () => {
        const id = focusedId();
        if (id) {
          window.terminalAPI.resizePty(id, 80, 24).catch(() => {});
          window.terminalAPI.writePty(id, '\x1b[I\x1b[?1h\x1b[?1l');
          store().setFocus(id);
        }
      }},
      { id: 'jumpToPrompt', label: 'Jump to Prompt', shortcut: 'Ctrl+Shift+K', action: () => { const id = focusedId(); if (id) store().showPromptsForTerminal(id); } },
      // Prompt Editor is AI-session-only (mirrors the per-pane context
      // menu). Hide the entry when the focused pane isn't an AI session.
      ...(focusedAiSessionId ? [{
        id: 'promptComposer',
        label: 'Open Prompt Editor',
        shortcut: 'Ctrl+Alt+E',
        action: () => { const id = focusedId(); if (id) store().openPromptComposer(id); },
      }] : []),
      { id: 'searchPrompts', label: 'Search Prompts Across All Panes', shortcut: 'Ctrl+Shift+Y', action: () => store().togglePromptSearch() },
      { id: 'toggleTranscript', label: 'Toggle Session Transcript', shortcut: 'Ctrl+Alt+T', action: () => store().toggleTranscript() },
      { id: 'shortcuts', label: 'Show Keyboard Shortcuts', shortcut: 'Ctrl+Shift+?', action: () => store().toggleShortcuts() },
      { id: 'settings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => store().toggleSettings() },
      { id: 'backlog', label: 'Open Backlog Board', shortcut: 'Ctrl+Alt+B', action: () => store().toggleBacklog() },
      { id: 'tabsFlatMode', label: 'Tabs: Use flat mode (one tab per terminal)', action: () => {
        store().updateConfig({ tabMode: 'flat' });
      }},
      { id: 'tabsWorkspacesMode', label: 'Tabs: Use workspaces mode (each tab = a collection of panes)', action: () => {
        store().updateConfig({ tabMode: 'workspaces' });
      }},
      { id: 'newWorkspace', label: 'Workspace: New', action: async () => {
        store().createWorkspace();
        await store().createTerminal();
      }},
      { id: 'nextWorkspace', label: 'Workspace: Next', shortcut: 'Ctrl+Shift+]', action: () => {
        const s = store();
        const ids = [...s.workspaces.keys()];
        if (ids.length < 2) return;
        const i = ids.indexOf(s.activeWorkspaceId);
        s.setActiveWorkspace(ids[(i + 1) % ids.length]);
      }},
      { id: 'prevWorkspace', label: 'Workspace: Previous', shortcut: 'Ctrl+Shift+[', action: () => {
        const s = store();
        const ids = [...s.workspaces.keys()];
        if (ids.length < 2) return;
        const i = ids.indexOf(s.activeWorkspaceId);
        s.setActiveWorkspace(ids[(i - 1 + ids.length) % ids.length]);
      }},
      // TASK-78: per-workspace "Move pane to workspace: <name>" entries. We
      // generate one row per workspace (minus the focused pane's own
      // workspace) so users can fuzzy-search "move pane" and pick the
      // destination in one keystroke. Hidden entirely when there's no
      // focused pane or only one workspace exists.
      ...(() => {
        const s = store();
        const focused = s.focusedTerminalId;
        if (!focused) return [];
        if (s.workspaces.size < 2) return [];
        const inst = s.terminals.get(focused);
        if (!inst) return [];
        const currentWsId = inst.workspaceId ?? s.activeWorkspaceId;
        return [...s.workspaces.values()]
          .filter((ws) => ws.id !== currentWsId)
          .map((ws) => ({
            id: `movePaneToWorkspace-${ws.id}`,
            label: `Move pane to workspace: ${ws.name}`,
            action: () => store().movePaneToWorkspace(focused, ws.id),
          }));
      })(),
      { id: 'openKeybindings', label: 'Keybindings: Open File', action: () => {
        (window.terminalAPI as any).openKeybindingsFile?.();
      }},
      { id: 'resetKeybindings', label: 'Keybindings: Reset to Defaults', action: async () => {
        const ok = await confirmDialog({
          title: 'Reset keybindings?',
          message: 'Overwrite keybindings.json with the default bindings?\nYour customizations will be lost.',
          confirmText: 'Reset',
          danger: true,
        });
        if (ok) (window.terminalAPI as any).resetKeybindings?.();
      }},
      { id: 'checkForUpdates', label: 'Check for Updates', action: () => {
        window.terminalAPI.checkForUpdates();
      }},
      { id: 'openDiagLog', label: 'Open Diagnostics Log', action: () => {
        window.terminalAPI.getDiagLogPath().then((p: string) => (window.terminalAPI as any).openPath(p));
      }},
      { id: 'resetMouseMode', label: 'Reset Terminal (recover scroll / selection / display)', action: () => {
        // Manual escape hatch for the bug where a TUI (e.g. Copilot CLI,
        // Claude Code, fzf inline mode) enables terminal features and dies
        // without restoring them - leaving the pane with broken drag-select
        // (stuck mouse tracking), dead wheel-scroll + a black slab over the
        // prompt (stuck on the alt-screen buffer), until restart (GH #117,
        // TASK-162/163). Writes the full recovery (mouse reset + alt-screen
        // exit + SGR reset) directly to the focused pane's xterm so the user
        // doesn't have to drop to a shell and printf it manually.
        const id = focusedId();
        if (!id) {
          store().addToast('No focused terminal');
          return;
        }
        const entry = getTerminalEntry(id);
        if (!entry) {
          store().addToast('Could not access focused terminal');
          return;
        }
        try {
          entry.terminal.write(TERMINAL_RECOVER_SEQUENCE);
          window.terminalAPI.diagLog?.('renderer:terminal-recover-manual', { terminalId: id });
          store().addToast('Terminal reset - scroll, selection and display should work now');
        } catch (err) {
          store().addToast('Failed to reset terminal');
        }
      }},
      { id: 'reportIssue', label: 'Report Issue', action: () => {
        const version = document.querySelector('.status-dim')?.textContent?.replace('v', '') || 'unknown';
        const platform = navigator.platform;
        const issueBody = `**Version:** ${version}\n**Platform:** ${platform}\n\n**Description:**\n\n\n**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**\n`;
        window.terminalAPI.clipboardWrite(issueBody);
        window.open(`https://github.com/InbarR/tmax/issues/new?body=${encodeURIComponent(issueBody)}`, '_blank');
        store().addToast('Issue template copied to clipboard. If GitHub blocks you (EMU account), open in a private/incognito window.');
      }},
      { id: 'editConfig', label: 'Open Settings JSON File', action: () => {
        // Open the config JSON in the default editor
        window.terminalAPI.openConfigFile?.();
      }},
      { id: 'saveLayout', label: 'Save Layout...', action: () => {
        setDialog({ title: 'Save Layout', placeholder: 'Enter layout name...', onSubmit: (name) => { store().saveNamedLayout(name); setDialog(null); } });
      }},
      { id: 'loadLayout', label: 'Load Layout...', action: () => {
        store().getLayoutNames().then((layouts) => {
          if (layouts.length === 0) {
            setDialog({ title: 'No Saved Layouts', placeholder: 'Save a layout first', options: [], onSubmit: () => setDialog(null) });
          } else {
            const options = layouts.map((l) => `${l.name} (${l.count} terminal${l.count !== 1 ? 's' : ''})`);
            setDialog({ title: 'Load Layout', placeholder: 'Type to filter...', options, onSubmit: (display) => {
              const name = display.replace(/\s*\(\d+ terminals?\)$/, '');
              store().loadNamedLayout(name);
              setDialog(null);
            }});
          }
        });
      }},
      // Theme presets
      { id: 'theme-mocha', label: 'Theme: Catppuccin Mocha (Default)', action: () => store().updateConfig({ theme: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#585b70', black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de' } }) },
      { id: 'theme-dracula', label: 'Theme: Dracula', action: () => store().updateConfig({ theme: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2' } }) },
      { id: 'theme-nord', label: 'Theme: Nord', action: () => store().updateConfig({ theme: { background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e', black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0' } }) },
      { id: 'theme-gruvbox', label: 'Theme: Gruvbox Dark', action: () => store().updateConfig({ theme: { background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945', black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984' } }) },
      { id: 'theme-tokyonight', label: 'Theme: Tokyo Night', action: () => store().updateConfig({ theme: { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c', black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6' } }) },
      { id: 'theme-solarized', label: 'Theme: Solarized Dark', action: () => store().updateConfig({ theme: { background: '#002b36', foreground: '#839496', cursor: '#839496', selectionBackground: '#073642', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' } }) },
      { id: 'theme-onedark', label: 'Theme: One Dark', action: () => store().updateConfig({ theme: { background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4452', black: '#545862', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf' } }) },
      { id: 'theme-solarized-light', label: 'Theme: Solarized Light', action: () => store().updateConfig({ theme: { background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', selectionBackground: '#eee8d5', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' } }) },
      { id: 'theme-github-light', label: 'Theme: GitHub Light', action: () => store().updateConfig({ theme: { background: '#ffffff', foreground: '#24292e', cursor: '#044289', selectionBackground: '#c8c8fa', black: '#24292e', red: '#d73a49', green: '#22863a', yellow: '#b08800', blue: '#0366d6', magenta: '#6f42c1', cyan: '#1b7c83', white: '#6a737d' } }) },
      { id: 'theme-catppuccin-latte', label: 'Theme: Catppuccin Latte', action: () => store().updateConfig({ theme: { background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selectionBackground: '#acb0be', black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d', blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#bcc0cc' } }) },
      // Shell-specific new terminals
      ...(useTerminalStore.getState().config?.shells ?? []).map((shell) => ({
        id: `newTerminal-${shell.id}`,
        label: `New Terminal: ${shell.name}`,
        action: () => store().createTerminal(shell.id),
      })),
    ];
  }, [focusedAiSessionId]);

  // Effective action -> key, merging defaults with config overrides exactly
  // like useKeybindings does. Lets a palette row display the user's rebound
  // shortcut (TASK-193) instead of the static default baked into the command.
  const configKeybindings = useTerminalStore((s) => s.config?.keybindings);
  const effectiveKeyByAction = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_BINDINGS }; // key -> action
    if (Array.isArray(configKeybindings)) {
      const cfgActions = new Set(configKeybindings.map((b) => b.action));
      for (const [key, action] of Object.entries(merged)) if (cfgActions.has(action)) delete merged[key];
      for (const b of configKeybindings) merged[b.key] = b.action;
    }
    const byAction: Record<string, string> = {};
    for (const [key, action] of Object.entries(merged)) if (!byAction[action]) byAction[action] = key;
    return byAction;
  }, [configKeybindings]);

  // Shortcut text to render for a command: prefer the live binding for its
  // action, fall back to the static label baked into the command.
  const shortcutFor = useCallback((cmd: Command): string | undefined => {
    const action = actionForCommandId(cmd.id);
    if (action && effectiveKeyByAction[action]) return effectiveKeyByAction[action];
    return cmd.shortcut;
  }, [effectiveKeyByAction]);

  const filtered = useMemo(() => {
    const tokens = tokenizeAnd(query);
    if (tokens.length === 0) return commands;
    return commands.filter((c) => {
      const haystack = `${c.label}\n${c.shortcut || ''}`.toLowerCase();
      return matchesAllTokens(haystack, tokens);
    });
  }, [commands, query]);

  useEffect(() => {
    if (show) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [show]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const close = useCallback(() => {
    useTerminalStore.getState().toggleCommandPalette();
  }, []);

  const runCommand = useCallback((cmd: Command) => {
    close();
    // Delay action slightly so palette closes first
    requestAnimationFrame(() => cmd.action());
  }, [close]);

  // TASK-193: persist a new key combo for an action, mirroring the rebind
  // logic in Settings > Keybindings (config.keybindings overrides defaults).
  const rebind = useCallback((action: string, key: string) => {
    const store = useTerminalStore.getState();
    const current = store.config?.keybindings ?? [];
    const next = current.filter((b) => b.action !== action);
    next.push({ action, key });
    store.updateConfig({ keybindings: next });
  }, []);

  // Reset an action to its default shortcut by dropping any user override.
  const resetBinding = useCallback((action: string) => {
    const store = useTerminalStore.getState();
    const current = store.config?.keybindings ?? [];
    store.updateConfig({ keybindings: current.filter((b) => b.action !== action) });
  }, []);

  // Human-readable label for an action (for confirm dialogs), from the command
  // whose id maps to it; falls back to a friendly name for bindable actions
  // that have no palette row (e.g. the palette itself), then the raw action.
  const labelForAction = useCallback(
    (action: string) =>
      commands.find((c) => actionForCommandId(c.id) === action)?.label ??
      ACTION_LABELS[action] ??
      action,
    [commands],
  );

  // Capture the next key combo while a palette command is being rebound, then
  // CONFIRM before applying (and warn if the combo is already taken). Same
  // capture pattern as KeybindingsSettings: ignore lone modifiers, Esc cancels,
  // metaKey on Mac for the primary modifier.
  useEffect(() => {
    if (rebindingAction === null) return;
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let key = e.key;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
      if (key === 'Escape') { setRebindingAction(null); return; }
      const parts: string[] = [];
      if (isMac ? e.metaKey : e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();
      parts.push(key);
      const keyStr = parts.join('+');
      const action = rebindingAction;
      setRebindingAction(null); // leave recording mode before the async confirm
      // Is this combo already bound to a different command?
      const conflict = Object.entries(effectiveKeyByAction).find(([a, k]) => k === keyStr && a !== action)?.[0];
      const shown = formatKeyForPlatform(keyStr);
      const message = conflict
        ? `${shown} is currently assigned to "${labelForAction(conflict)}". Reassign it to "${labelForAction(action)}"? "${labelForAction(conflict)}" will lose this shortcut.`
        : `Assign ${shown} to "${labelForAction(action)}"?`;
      const ok = await confirmDialog({ title: 'Change shortcut?', message, confirmText: 'Assign', danger: !!conflict });
      if (!ok) return;
      rebind(action, keyStr);
      useTerminalStore.getState().addToast('Shortcut updated');
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [rebindingAction, rebind, effectiveKeyByAction, labelForAction]);

  // Right-click opens a small menu (Reassign / Reset), rather than jumping
  // straight into capture - so a stray right-click can't silently rebind.
  const handleContextMenu = useCallback((e: React.MouseEvent, cmd: Command) => {
    const action = actionForCommandId(cmd.id);
    if (!action) return; // not rebindable - let the native menu through
    e.preventDefault();
    setRebindMenu({ x: e.clientX, y: e.clientY, cmd, action });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) runCommand(filtered[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
    e.stopPropagation();
  }, [filtered, selectedIndex, runCommand, close]);

  if (!show && !dialog) return null;

  if (dialog) {
    return (
      <InputDialog
        title={dialog.title}
        placeholder={dialog.placeholder}
        options={dialog.options}
        onSubmit={dialog.onSubmit}
        onClose={() => setDialog(null)}
      />
    );
  }

  return (
    <div className="palette-backdrop" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.map((cmd, index) => {
            const rebindable = actionForCommandId(cmd.id) !== null;
            const recording = rebindable && rebindingAction === actionForCommandId(cmd.id);
            return (
              <div
                key={cmd.id}
                className={`palette-item${index === selectedIndex ? ' selected' : ''}`}
                onClick={() => { if (recording) { setRebindingAction(null); return; } runCommand(cmd); }}
                onMouseEnter={() => setSelectedIndex(index)}
                onContextMenu={(e) => handleContextMenu(e, cmd)}
                title={rebindable ? 'Right-click to change shortcut' : undefined}
              >
                <span className="palette-label">{cmd.label}</span>
                {recording ? (
                  <kbd className="palette-shortcut recording">Press keys... (Esc)</kbd>
                ) : (
                  (() => { const sc = shortcutFor(cmd); return sc ? <kbd className="palette-shortcut">{formatKeyForPlatform(sc)}</kbd> : null; })()
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
        </div>
      </div>
      {rebindMenu && (
        <div
          className="palette-rebind-overlay"
          onClick={() => setRebindMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setRebindMenu(null); }}
        >
          <div
            className="context-menu"
            style={{ position: 'fixed', left: rebindMenu.x, top: rebindMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu-header">{rebindMenu.cmd.label}</div>
            <button
              className="context-menu-item"
              onClick={() => { const a = rebindMenu.action; setRebindMenu(null); setRebindingAction(a); }}
            >
              Reassign shortcut…
            </button>
            {Array.isArray(configKeybindings) && configKeybindings.some((b) => b.action === rebindMenu.action) && (
              <button
                className="context-menu-item"
                onClick={() => { resetBinding(rebindMenu.action); setRebindMenu(null); useTerminalStore.getState().addToast('Shortcut reset to default'); }}
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CommandPalette;
