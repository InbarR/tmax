import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTerminalStore, TAB_COLORS } from '../state/terminal-store';
import type { TerminalId } from '../state/types';
import TabContextMenu, { type ContextMenuPosition } from './TabContextMenu';
import { isMac } from '../utils/platform';

interface TabProps {
  terminalId: TerminalId;
  title: string;
  isActive: boolean;
  isRenaming: boolean;
  groupColor?: string;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const Tab: React.FC<TabProps> = ({
  terminalId,
  title,
  isActive,
  isRenaming,
  groupColor,
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
  const showCloseBtn = useTerminalStore((s) => !s.hideTabCloseButtons);

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

  const effectiveColor = groupColor || tabColor;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(effectiveColor
      ? { borderBottom: `3px solid ${effectiveColor}` }
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
        if (isMac ? e.metaKey : e.ctrlKey) {
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
      {showCloseBtn && (
        <button className="close-btn" onClick={handleCloseClick} title="Close">
          &#10005;
        </button>
      )}
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
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
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

  // Close group menu on outside click
  useEffect(() => {
    if (!groupMenu) return;
    const handler = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) setGroupMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [groupMenu]);

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

  // In flat tab mode, filter terminals to the active workspace so users
  // who opted into workspaces and then back to flat don't see ghost
  // tabs from other workspaces. In a single-workspace install this is a
  // no-op. (TASK-40)
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId);
  const allEntries = Array.from(terminals.entries());
  const terminalEntries = allEntries.filter(([, t]) =>
    (t.workspaceId ?? activeWorkspaceId) === activeWorkspaceId,
  );
  const terminalIds = useMemo(() => terminalEntries.map(([id]) => id), [terminalEntries]);
  const sortStrategy = vertical ? verticalListSortingStrategy : horizontalListSortingStrategy;

  // Build grouped tab sections
  const sections = useMemo(() => {
    const result: Array<
      | { type: 'group'; groupId: string; name: string; color: string; collapsed: boolean }
      | { type: 'tab'; id: string; terminal: typeof terminalEntries[0][1]; groupColor?: string }
    > = [];
    const usedIds = new Set<string>();

    for (const [, group] of tabGroups) {
      const groupTabs = terminalEntries.filter(([, t]) => t.groupId === group.id);
      if (groupTabs.length === 0) continue;
      result.push({ type: 'group', groupId: group.id, name: group.name, color: group.color, collapsed: group.collapsed });
      for (const [id, terminal] of groupTabs) {
        usedIds.add(id);
        if (!group.collapsed) {
          result.push({ type: 'tab', id, terminal, groupColor: group.color });
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
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setGroupMenu({ x: e.clientX, y: e.clientY, groupId: section.groupId });
              }}
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
              groupColor={section.groupColor}
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
      <button
        className="tab-mode-switch"
        onClick={() => useTerminalStore.getState().updateConfig({ tabMode: 'workspaces' })}
        title="Switch to workspaces (each tab = a grid of panes)"
      >
        Switch to workspaces
      </button>
      {contextMenu && (
        <TabContextMenu
          position={contextMenu}
          selectedAtOpen={contextMenu.selectedAtOpen || []}
          onClose={() => setContextMenu(null)}
        />
      )}
      {groupMenu && ReactDOM.createPortal(
        <div
          ref={groupMenuRef}
          className="context-menu"
          style={{ left: groupMenu.x, top: groupMenu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-inline-input">
            <input
              type="text"
              defaultValue={tabGroups.get(groupMenu.groupId)?.name || ''}
              placeholder="Group name..."
              autoFocus
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) useTerminalStore.getState().renameTabGroup(groupMenu.groupId, val);
                  setGroupMenu(null);
                }
                if (e.key === 'Escape') setGroupMenu(null);
              }}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val) useTerminalStore.getState().renameTabGroup(groupMenu.groupId, val);
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 10px' }}>
            {TAB_COLORS.map((c) => (
              <div
                key={c.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const { tabGroups: groups } = useTerminalStore.getState();
                  const g = groups.get(groupMenu.groupId);
                  if (g) {
                    const newGroups = new Map(groups);
                    newGroups.set(groupMenu.groupId, { ...g, color: c.value });
                    useTerminalStore.setState({ tabGroups: newGroups });
                  }
                  setGroupMenu(null);
                }}
                style={{
                  width: 16, height: 16, borderRadius: '50%', background: c.value, cursor: 'pointer',
                  outline: tabGroups.get(groupMenu.groupId)?.color === c.value ? '2px solid #fff' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            useTerminalStore.getState().deleteTabGroup(groupMenu.groupId);
            setGroupMenu(null);
          }}>
            Ungroup All
          </button>
          <button className="context-menu-item danger" onClick={() => {
            const store = useTerminalStore.getState();
            const ids = Array.from(store.terminals.entries())
              .filter(([, t]) => t.groupId === groupMenu.groupId)
              .map(([id]) => id);
            store.deleteTabGroup(groupMenu.groupId);
            (async () => { for (const id of ids) await store.closeTerminal(id); })();
            setGroupMenu(null);
          }}>
            Close All
          </button>
        </div>,
        document.body,
      )}
      {vertical && <div className="tab-bar-resize" onMouseDown={handleResizeStart} />}
    </div>
  );
};

export default TabBar;
