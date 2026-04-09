import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore, TAB_COLORS } from '../state/terminal-store';
import type { TerminalId } from '../state/types';

export interface ContextMenuPosition {
  x: number;
  y: number;
  terminalId: TerminalId;
}

interface TabContextMenuProps {
  position: ContextMenuPosition;
  selectedAtOpen: string[];
  onClose: () => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({ position, selectedAtOpen, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const store = useTerminalStore.getState;
  const terminal = useTerminalStore((s) => s.terminals.get(position.terminalId));
  const tabGroups = useTerminalStore((s) => s.tabGroups);
  const config = useTerminalStore((s) => s.config);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const hasAnyColor = useTerminalStore((s) => s.autoColorTabs);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    // Use capture phase so Escape is caught before xterm.js swallows it
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose]);

  // Adjust position if menu overflows viewport
  const [adjustedPos, setAdjustedPos] = useState({ x: position.x, y: position.y });
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 4;
    let { x, y } = position;
    // Keep right edge within viewport
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    // Keep bottom edge within viewport
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setAdjustedPos({ x, y });
  }, [position]);

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
      store().renameTerminal(position.terminalId, renameValue.trim(), true);
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

  const handleToggleDormant = useCallback(() => {
    if (isDormant) {
      store().wakeFromDormant(position.terminalId);
    } else {
      store().moveToDormant(position.terminalId);
    }
    onClose();
  }, [position.terminalId, isDormant, onClose]);

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
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
            store().toggleViewMode();
            onClose();
          }}>
            {store().viewMode === 'focus' ? 'Split Mode' : 'Focus Mode'} <span className="shortcut">Ctrl+Shift+F</span>
          </button>
          {selectedAtOpen.length >= 2 && (
            <button className="context-menu-item" onClick={() => {
              store().gridSelectedTabs(selectedAtOpen);
              onClose();
            }}>
              Split Selected ({selectedAtOpen.length} tabs)
            </button>
          )}
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
            {isDormant ? 'Wake' : 'Hide (Dormant)'} <span className="shortcut">Ctrl+Shift+H</span>
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
              <button className="context-menu-item" onClick={() => {
                store().colorizeAllTabs();
                onClose();
              }}>
                {hasAnyColor ? 'Clear All Tab Colors' : 'Colorize All Tabs'}
              </button>
            </>
          )}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            store().toggleHideTabTitles();
            onClose();
          }}>
            Hide Tab Bar <span className="context-menu-shortcut">Ctrl+Shift+B</span>
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => setShowGroupMenu((v) => !v)}>
            {terminal?.groupId ? 'Change Group' : 'Add to Group'} &#9656;
          </button>
          {showGroupMenu && (
            <div className="context-menu-sub">
              {Array.from(tabGroups.values()).map((g) => (
                <button key={g.id} className={`context-menu-item sub${terminal?.groupId === g.id ? ' active-check' : ''}`} onClick={() => {
                  store().addToGroup(position.terminalId, g.id);
                  onClose();
                }}>
                  <span className="color-dot" style={{ background: g.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6 }} />
                  {g.name} {terminal?.groupId === g.id ? '\u2713' : ''}
                </button>
              ))}
              {terminal?.groupId && (
                <button className="context-menu-item" onClick={() => { store().removeFromGroup(position.terminalId); onClose(); }}>
                  Remove from Group
                </button>
              )}
              <div className="context-menu-separator" />
              <div className="context-menu-inline-input">
                <input
                  ref={newGroupInputRef}
                  type="text"
                  placeholder="New group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && newGroupName.trim()) {
                      const colors = ['#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af', '#cba6f7', '#fab387'];
                      const color = colors[tabGroups.size % colors.length];
                      const groupId = store().createTabGroup(newGroupName.trim(), color);
                      store().addToGroup(position.terminalId, groupId);
                      onClose();
                    }
                  }}
                  onClick={(e) => { e.stopPropagation(); requestAnimationFrame(() => newGroupInputRef.current?.focus()); }}
                />
              </div>
            </div>
          )}
          <div className="context-menu-label">Tab Bar Position</div>
          {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
            <button key={pos} className={`context-menu-item sub${store().tabBarPosition === pos ? ' active-check' : ''}`} onClick={() => {
              (store() as any).setTabBarPosition(pos);
              onClose();
            }}>
              {pos.charAt(0).toUpperCase() + pos.slice(1)} {store().tabBarPosition === pos ? '\u2713' : ''}
            </button>
          ))}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            // Force re-focus and resize-ping all PTYs to unfreeze
            for (const [id] of store().terminals) {
              window.terminalAPI.resizePty(id, 80, 24).catch(() => {});
            }
            // Send focus-in report + terminal reset to unstick input (fixes DEC 1004 desync)
            window.terminalAPI.writePty(position.terminalId, '\x1b[I\x1b[?1h\x1b[?1l');
            store().setFocus(position.terminalId);
            onClose();
          }}>
            Unfreeze Terminal
          </button>
          {terminal?.aiSessionId && terminal?.startupCommand && (
            <button className="context-menu-item" onClick={() => {
              const tid = position.terminalId;
              const cmd = terminal.startupCommand;
              // Send Ctrl+C twice to kill the stuck process, then re-launch
              window.terminalAPI.writePty(tid, '\x03\x03');
              setTimeout(() => {
                window.terminalAPI.writePty(tid, cmd + '\r');
              }, 500);
              store().setFocus(tid);
              onClose();
            }}>
              Restart Session
            </button>
          )}
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
    </div>,
    document.body,
  );
};

export default TabContextMenu;
