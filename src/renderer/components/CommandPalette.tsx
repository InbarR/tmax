import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import InputDialog from './InputDialog';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

const CommandPalette: React.FC = () => {
  const show = useTerminalStore((s) => s.showCommandPalette);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dialog, setDialog] = useState<{ title: string; placeholder?: string; options?: string[]; onSubmit: (value: string) => void } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo((): Command[] => {
    const store = useTerminalStore.getState;
    const focusedId = () => store().focusedTerminalId;

    return [
      { id: 'newTerminal', label: 'New Terminal', shortcut: 'Ctrl+Shift+N', action: () => store().createTerminal() },
      { id: 'closeTerminal', label: 'Close Terminal', shortcut: 'Ctrl+Shift+W', action: () => { const id = focusedId(); if (id) store().closeTerminal(id); } },
      { id: 'renameTerminal', label: 'Rename Terminal', shortcut: 'Ctrl+Shift+R', action: () => { const id = focusedId(); if (id) store().startRenaming(id); } },
      { id: 'jumpToTerminal', label: 'Jump to Terminal', shortcut: 'Ctrl+Shift+G', action: () => store().toggleSwitcher() },
      { id: 'tabMenu', label: 'Open Tab Menu', shortcut: 'Ctrl+Shift+M', action: () => store().openTabMenu() },
      { id: 'focusNext', label: 'Focus Next Terminal', shortcut: 'Ctrl+Tab', action: () => store().focusNext() },
      { id: 'focusPrev', label: 'Focus Previous Terminal', shortcut: 'Ctrl+Shift+Tab', action: () => store().focusPrev() },
      { id: 'splitRight', label: 'Split Right', shortcut: 'Ctrl+Alt+\u2192', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'horizontal', undefined, 'right'); } },
      { id: 'splitDown', label: 'Split Down', shortcut: 'Ctrl+Alt+\u2193', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'vertical', undefined, 'bottom'); } },
      { id: 'splitLeft', label: 'Split Left', shortcut: 'Ctrl+Alt+\u2190', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'horizontal', undefined, 'left'); } },
      { id: 'splitUp', label: 'Split Up', shortcut: 'Ctrl+Alt+\u2191', action: () => { const id = focusedId(); if (id) store().splitTerminal(id, 'vertical', undefined, 'top'); } },
      { id: 'toggleFocusMode', label: 'Toggle Focus Mode (Maximize Terminal)', shortcut: 'Ctrl+Shift+F', action: () => { const id = focusedId(); if (id) store().toggleFocusMode(id); } },
      { id: 'toggleDormant', label: 'Toggle Hide (Dormant)', shortcut: 'Ctrl+Shift+H', action: () => { const id = focusedId(); if (id) { const t = store().terminals.get(id); if (t?.mode === 'dormant') store().wakeFromDormant(id); else store().moveToDormant(id); } } },
      { id: 'equalize', label: 'Equalize Pane Sizes', shortcut: 'Ctrl+Shift+E', action: () => store().equalizeLayout() },
      { id: 'zoomIn', label: 'Zoom In', shortcut: 'Ctrl+=', action: () => store().zoomIn() },
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
      { id: 'dirPicker', label: 'Go to Directory (Favorites & Recent)', shortcut: 'Ctrl+Shift+D', action: () => store().toggleDirPicker() },
      { id: 'toggleTabBar', label: 'Toggle Tab Bar: Top / Left', action: () => store().toggleTabBarPosition() },
      { id: 'shortcuts', label: 'Show Keyboard Shortcuts', shortcut: 'Ctrl+Shift+/', action: () => store().toggleShortcuts() },
      { id: 'settings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => store().toggleSettings() },
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
  }, []);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      (c.shortcut && c.shortcut.toLowerCase().includes(q))
    );
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
        <div className="palette-list" ref={listRef}>
          {filtered.map((cmd, index) => (
            <div
              key={cmd.id}
              className={`palette-item${index === selectedIndex ? ' selected' : ''}`}
              onClick={() => runCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="palette-label">{cmd.label}</span>
              {cmd.shortcut && <kbd className="palette-shortcut">{cmd.shortcut}</kbd>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
