import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTerminalStore } from '../state/terminal-store';
import type { TerminalId } from '../state/types';
import TabContextMenu, { type ContextMenuPosition } from './TabContextMenu';

interface TabProps {
  terminalId: TerminalId;
  title: string;
  isActive: boolean;
  isRenaming: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const Tab: React.FC<TabProps> = ({
  terminalId,
  title,
  isActive,
  isRenaming,
  onActivate,
  onClose,
  onContextMenu,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: terminalId });
  const [renameValue, setRenameValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, title]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim()) {
      useTerminalStore.getState().renameTerminal(terminalId, renameValue.trim(), true);
    }
    useTerminalStore.getState().startRenaming(null);
  }, [terminalId, renameValue]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') useTerminalStore.getState().startRenaming(null);
  }, [handleRenameSubmit]);

  const terminals = useTerminalStore((s) => s.terminals);
  const terminal = terminals.get(terminalId);
  const isDormant = terminal?.mode === 'dormant';
  const isDetached = terminal?.mode === 'detached';
  const tabColor = terminal?.tabColor;
  const isSelected = useTerminalStore((s) => !!s.selectedTerminalIds[terminalId]);
  const className = `tab${isActive ? ' active' : ''}${isDormant ? ' dormant' : ''}${isDetached ? ' detached' : ''}${isSelected ? ' selected' : ''}`;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    ...(tabColor ? { background: `${tabColor}55`, borderBottom: `2px solid ${tabColor}` } : {}),
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      onClick={(e) => {
        if (e.ctrlKey) {
          useTerminalStore.getState().toggleSelectTerminal(terminalId);
        } else {
          useTerminalStore.getState().clearSelection();
          onActivate();
        }
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={() => useTerminalStore.getState().startRenaming(terminalId)}
      {...attributes}
      {...listeners}
    >
      {isRenaming ? (
        <input
          ref={inputRef}
          className="tab-rename-input"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tab-title">{title}</span>
      )}
      <button className="close-btn" onClick={handleCloseClick} title="Close">
        &#10005;
      </button>
    </div>
  );
};

const TabBar: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const terminals = useTerminalStore((s) => s.terminals);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const renamingId = useTerminalStore((s) => s.renamingTerminalId);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const handleCreate = useCallback(() => {
    useTerminalStore.getState().createTerminal();
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, terminalId: TerminalId) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, terminalId });
    },
    []
  );

  const terminalEntries = Array.from(terminals.entries());

  return (
    <div className={`tab-bar${vertical ? ' vertical' : ''}`}>
      {terminalEntries.map(([id, terminal]) => (
        <Tab
          key={id}
          terminalId={id}
          title={terminal.title}
          isActive={focusedTerminalId === id}
          isRenaming={renamingId === id}
          onActivate={() => useTerminalStore.getState().setFocus(id)}
          onClose={() => useTerminalStore.getState().closeTerminal(id)}
          onContextMenu={(e) => handleContextMenu(e, id)}
        />
      ))}
      <button className="tab-add" onClick={handleCreate} title="New Terminal">
        +
      </button>
      {contextMenu && (
        <TabContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default TabBar;
