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
          <button className="context-menu-item" onClick={handleToggleFloat}>
            {isFloating ? 'Dock to Tiling' : 'Float'} <span className="shortcut">Ctrl+Shift+F</span>
          </button>
          <button className="context-menu-item" onClick={() => {
            onClose();
            // Show command palette with startup command dialog
            useTerminalStore.getState().toggleCommandPalette();
          }}>
            Set Startup Command...
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
          <button className="context-menu-item danger" onClick={handleClose}>
            Close <span className="shortcut">Ctrl+Shift+W</span>
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
