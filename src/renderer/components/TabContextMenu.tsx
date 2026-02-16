import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { TerminalId } from '../state/types';

export interface ContextMenuPosition {
  x: number;
  y: number;
  terminalId: TerminalId;
}

interface TabContextMenuProps {
  position: ContextMenuPosition;
  onClose: () => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({ position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const store = useTerminalStore.getState;
  const terminal = useTerminalStore((s) => s.terminals.get(position.terminalId));
  const config = useTerminalStore((s) => s.config);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Focus input when renaming
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleRename = useCallback(() => {
    setRenameValue(terminal?.title ?? '');
    setRenaming(true);
  }, [terminal]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim()) {
      store().renameTerminal(position.terminalId, renameValue.trim());
    }
    onClose();
  }, [renameValue, position.terminalId, onClose]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') onClose();
    e.stopPropagation();
  }, [handleRenameSubmit, onClose]);

  const handleSplitRight = useCallback(() => {
    store().splitTerminal(position.terminalId, 'horizontal');
    onClose();
  }, [position.terminalId, onClose]);

  const handleSplitDown = useCallback(() => {
    store().splitTerminal(position.terminalId, 'vertical');
    onClose();
  }, [position.terminalId, onClose]);

  const handleToggleFloat = useCallback(() => {
    const t = store().terminals.get(position.terminalId);
    if (t?.mode === 'tiled') {
      store().moveToFloat(position.terminalId);
    } else {
      store().moveToTiling(position.terminalId);
    }
    onClose();
  }, [position.terminalId, onClose]);

  const handleClose = useCallback(() => {
    store().closeTerminal(position.terminalId);
    onClose();
  }, [position.terminalId, onClose]);

  const handleNewTerminal = useCallback((shellId: string) => {
    store().createTerminal(shellId);
    onClose();
  }, [onClose]);

  const isFloating = terminal?.mode === 'floating';
  const isDormant = terminal?.mode === 'dormant';
  const selectedIds = useTerminalStore((s) => s.selectedTerminalIds);
  const selectedKeys = Object.keys(selectedIds);
  // If there's a selection, include the right-clicked tab and operate on all; otherwise just this one
  const targetIds = selectedKeys.length > 0
    ? Array.from(new Set([...selectedKeys, position.terminalId]))
    : [position.terminalId];
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingStartupCmd, setEditingStartupCmd] = useState(false);
  const [startupCmdValue, setStartupCmdValue] = useState('');
  const startupInputRef = useRef<HTMLInputElement>(null);

  const TAB_COLORS = [
    { name: 'Red', value: '#ff4444' },
    { name: 'Green', value: '#44ff44' },
    { name: 'Blue', value: '#4488ff' },
    { name: 'Orange', value: '#ff8800' },
    { name: 'Purple', value: '#aa44ff' },
    { name: 'Cyan', value: '#00dddd' },
    { name: 'Pink', value: '#ff44aa' },
    { name: 'Yellow', value: '#ffdd00' },
  ];

  const handleToggleDormant = useCallback(() => {
    if (isDormant) {
      store().wakeFromDormant(position.terminalId);
    } else {
      store().moveToDormant(position.terminalId);
    }
    onClose();
  }, [position.terminalId, isDormant, onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {renaming ? (
        <div className="context-menu-rename">
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameSubmit}
            className="rename-input"
          />
        </div>
      ) : (
        <>
          <button className="context-menu-item" onClick={handleRename}>
            Rename <span className="shortcut">Ctrl+Shift+R</span>
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={handleSplitRight}>
            Split Right <span className="shortcut">Ctrl+Alt+→</span>
          </button>
          <button className="context-menu-item" onClick={handleSplitDown}>
            Split Down <span className="shortcut">Ctrl+Alt+↓</span>
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            store().toggleFocusMode(position.terminalId);
            onClose();
          }}>
            {store().focusModeTerminalId === position.terminalId ? 'Exit Focus Mode' : 'Focus Mode'} <span className="shortcut">Ctrl+Shift+F</span>
          </button>
          <button className="context-menu-item" onClick={() => {
            const t = store().terminals.get(position.terminalId);
            if (t?.mode === 'detached') {
              window.terminalAPI.closeDetached(position.terminalId);
              store().reattachTerminal(position.terminalId);
            } else {
              store().detachTerminal(position.terminalId);
            }
            onClose();
          }}>
            {terminal?.mode === 'detached' ? 'Reattach' : 'Detach to Window'}
          </button>
          <button className="context-menu-item" onClick={handleToggleDormant}>
            {isDormant ? 'Wake' : 'Hide (Dormant)'}
          </button>
          <div className="context-menu-separator" />
          {showColorPicker ? (
            <div className="context-menu-colors">
              <div className="context-menu-label">Tab Color</div>
              <div className="color-picker-grid">
                {TAB_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="color-swatch"
                    style={{ background: c.value }}
                    title={c.name}
                    onClick={() => {
                      targetIds.forEach((tid) => store().setTabColor(tid, c.value));
                      onClose();
                    }}
                  />
                ))}
                <button
                  className="color-swatch clear"
                  title="Clear color"
                  onClick={() => {
                    targetIds.forEach((tid) => store().setTabColor(tid, undefined));
                    onClose();
                  }}
                >
                  &#10005;
                </button>
              </div>
            </div>
          ) : editingStartupCmd ? (
            <div className="context-menu-rename">
              <input
                ref={startupInputRef}
                type="text"
                className="rename-input"
                placeholder="e.g. npm run dev"
                value={startupCmdValue}
                onChange={(e) => setStartupCmdValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const terminals = new Map(store().terminals);
                    const t = terminals.get(position.terminalId);
                    if (t) {
                      terminals.set(position.terminalId, { ...t, startupCommand: startupCmdValue });
                      useTerminalStore.setState({ terminals });
                    }
                    onClose();
                  }
                  if (e.key === 'Escape') onClose();
                }}
                onBlur={() => {
                  const terminals = new Map(store().terminals);
                  const t = terminals.get(position.terminalId);
                  if (t) {
                    terminals.set(position.terminalId, { ...t, startupCommand: startupCmdValue });
                    useTerminalStore.setState({ terminals });
                  }
                  onClose();
                }}
              />
            </div>
          ) : (
            <>
              <div className="context-menu-item" style={{ display: 'flex', alignItems: 'center' }}>
                <button className="context-menu-item" style={{ flex: 1, padding: 0, border: 'none' }} onClick={() => setShowColorPicker(true)}>
                  Tab Color{terminal?.tabColor ? <span className="color-dot" style={{ background: terminal.tabColor }} /> : ''}
                </button>
                {terminal?.tabColor && (
                  <button
                    className="color-clear-btn"
                    onClick={(e) => { e.stopPropagation(); targetIds.forEach((tid) => store().setTabColor(tid, undefined)); onClose(); }}
                    title="Clear color"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            </>
          )}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            onClose();
            store().toggleCommandPalette();
          }}>
            Command Palette <span className="shortcut">Ctrl+Shift+P</span>
          </button>
          <button className="context-menu-item" onClick={() => {
            onClose();
            store().toggleSettings();
          }}>
            Settings <span className="shortcut">Ctrl+,</span>
          </button>
          <div className="context-menu-separator" />
          {config && config.shells.length > 1 && (
            <>
              <div className="context-menu-label">New Terminal</div>
              {config.shells.map((shell) => (
                <button
                  key={shell.id}
                  className="context-menu-item sub"
                  onClick={() => handleNewTerminal(shell.id)}
                >
                  {shell.name}
                </button>
              ))}
              <div className="context-menu-separator" />
            </>
          )}
          <button className="context-menu-item danger" onClick={() => {
            const sel = Object.keys(useTerminalStore.getState().selectedTerminalIds);
            const ids = sel.length > 0
              ? Array.from(new Set([...sel, position.terminalId]))
              : [position.terminalId];
            onClose();
            useTerminalStore.getState().clearSelection();
            (async () => { for (const id of ids) await useTerminalStore.getState().closeTerminal(id); })();
          }}>
            Close{targetIds.length > 1 ? ` (${targetIds.length})` : ''} <span className="shortcut">Ctrl+Shift+W</span>
          </button>
          <button className="context-menu-item danger" onClick={() => {
            onClose();
            const ids = Array.from(store().terminals.keys()).filter((id) => id !== position.terminalId);
            (async () => { for (const id of ids) await store().closeTerminal(id); })();
          }}>
            Close Others
          </button>
          <button className="context-menu-item danger" onClick={() => {
            onClose();
            const ids = Array.from(store().terminals.keys());
            (async () => { for (const id of ids) await store().closeTerminal(id); })();
          }}>
            Close All
          </button>
        </>
      )}
    </div>
  );
};

export default TabContextMenu;
