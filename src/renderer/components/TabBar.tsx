import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: terminalId });
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

  const terminal = useTerminalStore((s) => s.terminals.get(terminalId));
  const isDormant = terminal?.mode === 'dormant';
  const isDetached = terminal?.mode === 'detached';
  const tabColor = terminal?.tabColor;
  const isSelected = useTerminalStore((s) => !!s.selectedTerminalIds[terminalId]);
  const isInGrid = useTerminalStore((s) => !!s.gridTabIds[terminalId]);
  const viewMode = useTerminalStore((s) => s.viewMode);

  // Check if this tab's AI session needs attention.
  // Selector returns a primitive string so Zustand skips re-render when status is unchanged.
  const aiSessionId = terminal?.aiSessionId;
  const aiStatus = useTerminalStore((s) => {
    if (!aiSessionId) return null;
    const copilot = s.copilotSessions.find((x) => x.id === aiSessionId);
    if (copilot) return copilot.status;
    const claude = s.claudeCodeSessions.find((x) => x.id === aiSessionId);
    if (claude) return claude.status;
    return null;
  });
  const needsAttention = aiStatus === 'waitingForUser' || aiStatus === 'awaitingApproval';
  const isThinking = aiStatus === 'thinking' || aiStatus === 'executingTool';

  const className = `tab${isActive ? ' active' : ''}${isDormant ? ' dormant' : ''}${isDetached ? ' detached' : ''}${isSelected ? ' selected' : ''}${needsAttention ? ' needs-attention' : ''}${isThinking ? ' ai-thinking' : ''}`;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(tabColor
      ? isActive
        ? { background: `${tabColor}cc`, borderBottom: `3px solid ${tabColor}`, color: '#fff', filter: 'brightness(1.2)' }
        : { background: `${tabColor}44`, borderBottom: `2px solid ${tabColor}80`, color: '#aaa' }
      : {}),
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
      data-tab-id={terminalId}
      onClick={(e) => {
        if (e.ctrlKey) {
          const store = useTerminalStore.getState();
          // First Ctrl+Click: also select the currently focused tab
          if (Object.keys(store.selectedTerminalIds).length === 0 && store.focusedTerminalId && store.focusedTerminalId !== terminalId) {
            store.toggleSelectTerminal(store.focusedTerminalId);
          }
          store.toggleSelectTerminal(terminalId);
        } else {
          useTerminalStore.getState().clearSelection();
          onActivate();
        }
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        if (isDormant) {
          useTerminalStore.getState().wakeFromDormant(terminalId);
        } else {
          useTerminalStore.getState().startRenaming(terminalId);
        }
      }}
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
        <>
          {isInGrid && viewMode === 'grid' && <span className="tab-split-dot" />}
          <span className="tab-title">{title}</span>
        </>
      )}
      <button className="close-btn" onClick={handleCloseClick} title="Close">
        &#10005;
      </button>
    </div>
  );
};

const TAB_BAR_MIN_WIDTH = 120;
const TAB_BAR_MAX_WIDTH = 400;
const TAB_BAR_DEFAULT_WIDTH = 160;

const TabBar: React.FC<{ vertical?: boolean; side?: 'left' | 'right' }> = ({ vertical, side }) => {
  const terminals = useTerminalStore((s) => s.terminals);
  const tabGroups = useTerminalStore((s) => s.tabGroups);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const renamingId = useTerminalStore((s) => s.renamingTerminalId);
  const tabMenuTerminalId = useTerminalStore((s) => s.tabMenuTerminalId);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(TAB_BAR_DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = tabBarWidth;
    setResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = side === 'right' ? startX - moveEvent.clientX : moveEvent.clientX - startX;
      const newWidth = Math.max(TAB_BAR_MIN_WIDTH, Math.min(TAB_BAR_MAX_WIDTH, startWidth + delta));
      setTabBarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [tabBarWidth]);

  // Open/toggle context menu from keyboard shortcut
  useEffect(() => {
    if (!tabMenuTerminalId) return;
    useTerminalStore.setState({ tabMenuTerminalId: null });
    // Toggle: close if already open for the same terminal
    if (contextMenu && contextMenu.terminalId === tabMenuTerminalId) {
      setContextMenu(null);
      return;
    }
    const tabEl = document.querySelector(`[data-tab-id="${tabMenuTerminalId}"]`);
    if (tabEl) {
      const rect = tabEl.getBoundingClientRect();
      setContextMenu({ x: rect.left, y: rect.bottom, terminalId: tabMenuTerminalId });
    }
  }, [tabMenuTerminalId]);

  const handleCreate = useCallback(() => {
    useTerminalStore.getState().createTerminal();
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, terminalId: TerminalId) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = Object.keys(useTerminalStore.getState().selectedTerminalIds);
      setContextMenu({ x: e.clientX, y: e.clientY, terminalId, selectedAtOpen: sel });
    },
    []
  );

  const terminalEntries = Array.from(terminals.entries());
  const terminalIds = useMemo(() => terminalEntries.map(([id]) => id), [terminalEntries]);
  const sortStrategy = vertical ? verticalListSortingStrategy : horizontalListSortingStrategy;

  // Build grouped tab sections
  const sections = useMemo(() => {
    const result: Array<
      | { type: 'group'; groupId: string; name: string; color: string; collapsed: boolean }
      | { type: 'tab'; id: string; terminal: typeof terminalEntries[0][1] }
    > = [];
    const usedIds = new Set<string>();

    for (const [, group] of tabGroups) {
      const groupTabs = terminalEntries.filter(([, t]) => t.groupId === group.id);
      if (groupTabs.length === 0) continue;
      result.push({ type: 'group', groupId: group.id, name: group.name, color: group.color, collapsed: group.collapsed });
      for (const [id, terminal] of groupTabs) {
        usedIds.add(id);
        if (!group.collapsed) {
          result.push({ type: 'tab', id, terminal });
        }
      }
    }
    for (const [id, terminal] of terminalEntries) {
      if (!usedIds.has(id)) {
        result.push({ type: 'tab', id, terminal });
      }
    }
    return result;
  }, [terminalEntries, tabGroups]);

  return (
    <div
      className={`tab-bar${vertical ? ' vertical' : ''}${resizing ? ' resizing' : ''}`}
      style={vertical ? { width: tabBarWidth, minWidth: tabBarWidth } : undefined}
    >
      <SortableContext items={terminalIds} strategy={sortStrategy}>
        {sections.map((section) =>
          section.type === 'group' ? (
            <div
              key={`group-${section.groupId}`}
              className="tab-group-header"
              style={{ borderLeftColor: section.color }}
              onClick={() => useTerminalStore.getState().toggleTabGroupCollapse(section.groupId)}
            >
              <span className="tab-group-chevron">{section.collapsed ? '\u25B6' : '\u25BC'}</span>
              <span className="tab-group-name">{section.name}</span>
              <span className="tab-group-count">
                {terminalEntries.filter(([, t]) => t.groupId === section.groupId).length}
              </span>
            </div>
          ) : (
            <Tab
              key={section.id}
              terminalId={section.id}
              title={section.terminal.title}
              isActive={focusedTerminalId === section.id}
              isRenaming={renamingId === section.id}
              onActivate={() => useTerminalStore.getState().setFocus(section.id)}
              onClose={() => useTerminalStore.getState().closeTerminal(section.id)}
              onContextMenu={(e) => handleContextMenu(e, section.id)}
            />
          )
        )}
      </SortableContext>
      <button className="tab-add" onClick={handleCreate} title="New Terminal">
        +
      </button>
      {contextMenu && (
        <TabContextMenu
          position={contextMenu}
          selectedAtOpen={contextMenu.selectedAtOpen || []}
          onClose={() => setContextMenu(null)}
        />
      )}
      {vertical && <div className="tab-bar-resize" onMouseDown={handleResizeStart} />}
    </div>
  );
};

export default TabBar;
