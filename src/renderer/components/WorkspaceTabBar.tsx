import React, { useState, useEffect, useRef } from 'react';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTerminalStore, TAB_COLORS } from '../state/terminal-store';
import type { Workspace, WorkspaceId } from '../state/types';

// Tab bar variant for tabMode === 'workspaces' (TASK-40). Each chip is a
// workspace; clicking a chip switches the entire grid. + creates a new
// workspace + a fresh terminal in it. Right-click → context menu.

// Workspace sortable ids are namespaced ("workspace:<id>") so they can
// coexist with terminal-tab sortables in the same shared DndContext
// without clashing on raw uuids (TASK-136).
const WORKSPACE_SORT_PREFIX = 'workspace:';

interface WorkspaceTabProps {
  id: WorkspaceId;
  ws: Workspace;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement>;
  showCloseBtn: boolean;
  onActivate: () => void;
  onMiddleClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onAddPane: () => void;
  onClose: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

const WorkspaceTab: React.FC<WorkspaceTabProps> = ({
  id,
  ws,
  isActive,
  isRenaming,
  renameValue,
  renameInputRef,
  showCloseBtn,
  onActivate,
  onMiddleClick,
  onDoubleClick,
  onContextMenu,
  onAddPane,
  onClose,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: WORKSPACE_SORT_PREFIX + id });

  const chipStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(ws.color ? { borderBottom: `3px solid ${ws.color}` } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      className={`workspace-tab${isActive ? ' active' : ''}`}
      data-workspace-id={id}
      style={chipStyle}
      onClick={() => { if (!isRenaming) onActivate(); }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onMiddleClick();
        }
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={ws.name}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
    >
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="workspace-tab-rename"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            else if (e.key === 'Escape') onRenameCancel();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="workspace-tab-name">{ws.name}</span>
          {isActive && (
            <button
              className="workspace-tab-add-pane-inline"
              title="Add pane to this workspace"
              aria-label="Add pane to this workspace"
              onClick={(e) => {
                e.stopPropagation();
                onAddPane();
              }}
            >
              +
            </button>
          )}
          {showCloseBtn && (
            <button
              className="workspace-tab-close"
              title="Close workspace"
              aria-label="Close workspace"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </button>
          )}
        </>
      )}
    </div>
  );
};

const WorkspaceTabBar: React.FC<{ vertical?: boolean; side?: 'left' | 'right' }> = ({ vertical }) => {
  const workspaces = useTerminalStore((s) => s.workspaces);
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useTerminalStore((s) => s.setActiveWorkspace);
  const createWorkspace = useTerminalStore((s) => s.createWorkspace);
  const renameWorkspace = useTerminalStore((s) => s.renameWorkspace);
  const setWorkspaceColor = useTerminalStore((s) => s.setWorkspaceColor);
  const clearAllWorkspaceColors = useTerminalStore((s) => s.clearAllWorkspaceColors);
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace);
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const config = useTerminalStore((s) => s.config);
  const tabBarPosition = useTerminalStore((s) => s.tabBarPosition);
  const setTabBarPosition = useTerminalStore((s) => (s as any).setTabBarPosition);
  // TASK-79: discoverable affordance for the multi-select / Show-Selected
  // filter introduced in TASK-72. We render a toolbar button only when
  // there is a multi-selection (>= 2 panes). No selection -> no button ->
  // no clutter (AC #4).
  //
  // Why "selection count" and not "is filter active": showSelectedPanes()
  // intentionally preserves selectedTerminalIds while the filter is on, so
  // selection-count >= 2 covers both "user picked panes, ready to filter"
  // and "filter currently engaged, user can toggle off". This also avoids
  // false-positives from the regular grid<->focus toggle, which shares
  // viewMode='grid' + preGridRoot but has no selection behind it.
  const selectedTerminalIds = useTerminalStore((s) => s.selectedTerminalIds);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const preGridRoot = useTerminalStore((s) => s.preGridRoot);
  const showSelectedPanes = useTerminalStore((s) => s.showSelectedPanes);
  const showAllPanes = useTerminalStore((s) => s.showAllPanes);
  const clearSelection = useTerminalStore((s) => s.clearSelection);
  const selectionCount = Object.keys(selectedTerminalIds).length;
  // Filter-active = grid plumbing engaged AND we still hold a selection
  // (showSelectedPanes preserves it; gridSelectedTabs clears it).
  const isFilterActive = viewMode === 'grid' && !!preGridRoot && selectionCount >= 2;

  const [renamingId, setRenamingId] = useState<WorkspaceId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: WorkspaceId } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [showNewTerminalMenu, setShowNewTerminalMenu] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onClick = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [ctxMenu]);

  const closeMenu = () => {
    setCtxMenu(null);
    setShowColorPicker(false);
    setShowPositionMenu(false);
    setShowNewTerminalMenu(false);
  };

  const commitRename = () => {
    if (renamingId) {
      renameWorkspace(renamingId, renameValue);
      setRenamingId(null);
    }
  };

  const handleNew = async () => {
    createWorkspace();
    await createTerminal();
  };

  const handleClose = (id: WorkspaceId) => {
    if (workspaces.size <= 1) return;
    closeWorkspace(id);
  };

  const handleCloseOthers = (keepId: WorkspaceId) => {
    const ids = [...workspaces.keys()].filter((id) => id !== keepId);
    for (const id of ids) closeWorkspace(id);
  };

  const orderedIds = [...workspaces.keys()];
  const sortableIds = orderedIds.map((id) => WORKSPACE_SORT_PREFIX + id);
  const ctxWorkspace = ctxMenu ? workspaces.get(ctxMenu.id) : undefined;

  return (
    <div className={`workspace-tab-bar${vertical ? ' vertical' : ''}`} role="tablist">
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        {orderedIds.map((id) => {
          const ws = workspaces.get(id)!;
          return (
            <WorkspaceTab
              key={id}
              id={id}
              ws={ws}
              isActive={id === activeWorkspaceId}
              isRenaming={renamingId === id}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              showCloseBtn={workspaces.size > 1}
              onActivate={() => setActiveWorkspace(id)}
              onMiddleClick={() => handleClose(id)}
              onDoubleClick={() => {
                setRenameValue(ws.name);
                setRenamingId(id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                closeMenu();
                setCtxMenu({ x: e.clientX, y: e.clientY, id });
              }}
              onAddPane={() => createTerminal()}
              onClose={() => handleClose(id)}
              onRenameChange={setRenameValue}
              onRenameCommit={commitRename}
              onRenameCancel={() => setRenamingId(null)}
            />
          );
        })}
      </SortableContext>
      <button
        className="workspace-tab-new"
        title="New workspace"
        aria-label="New workspace"
        onClick={handleNew}
      >
        +
      </button>
      {selectionCount >= 2 && (
        <div
          className={`workspace-show-selected${isFilterActive ? ' active' : ''}`}
          title={
            isFilterActive
              ? 'Click to show all panes (exit selected-only filter)'
              : `Show only the ${selectionCount} selected pane${selectionCount === 1 ? '' : 's'}.\nTip: Ctrl/Cmd+click a pane title bar to toggle it in the selection.`
          }
        >
          <button
            type="button"
            className="workspace-show-selected-btn"
            aria-pressed={isFilterActive}
            onClick={() => {
              if (isFilterActive) {
                showAllPanes();
              } else {
                showSelectedPanes();
              }
            }}
          >
            <span className="workspace-show-selected-dot" aria-hidden="true" />
            {isFilterActive ? 'Show All' : `Show Selected (${selectionCount})`}
          </button>
          {!isFilterActive && (
            <button
              type="button"
              className="workspace-show-selected-clear"
              title="Clear pane selection"
              aria-label="Clear pane selection"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      <button
        className="tab-mode-switch"
        title="Switch to flat tabs (each tab = one terminal)"
        onClick={() => useTerminalStore.getState().updateConfig({ tabMode: 'flat' })}
      >
        Switch to tabs
      </button>
      {ctxMenu && ctxWorkspace && (
        <div
          ref={ctxMenuRef}
          className="context-menu"
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 2000, minWidth: 200 }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              setRenameValue(ctxWorkspace.name);
              setRenamingId(ctxMenu.id);
              closeMenu();
            }}
          >
            ✏️ Rename <span className="shortcut">Double-click</span>
          </button>
          <div className="context-menu-separator" />
          {showColorPicker ? (
            <div className="context-menu-colors">
              <div className="context-menu-label">Workspace Color</div>
              <div className="color-picker-grid">
                {TAB_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="color-swatch"
                    style={{ background: c.value }}
                    title={c.name}
                    onClick={() => {
                      setWorkspaceColor(ctxMenu.id, c.value);
                      closeMenu();
                    }}
                  />
                ))}
                <button
                  className="color-swatch clear"
                  title="Clear color"
                  onClick={() => {
                    setWorkspaceColor(ctxMenu.id, undefined);
                    closeMenu();
                  }}
                >
                  &#10005;
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="context-menu-item" style={{ display: 'flex', alignItems: 'center' }}>
                <button className="context-menu-item" style={{ flex: 1, padding: 0, border: 'none' }} onClick={() => setShowColorPicker(true)}>
                  Workspace Color{ctxWorkspace.color ? <span className="color-dot" style={{ background: ctxWorkspace.color }} /> : ''}
                </button>
                {ctxWorkspace.color && (
                  <button
                    className="color-clear-btn"
                    onClick={(e) => { e.stopPropagation(); setWorkspaceColor(ctxMenu.id, undefined); closeMenu(); }}
                    title="Clear color"
                  >
                    &#10005;
                  </button>
                )}
              </div>
              <button className="context-menu-item" onClick={() => {
                clearAllWorkspaceColors();
                closeMenu();
              }}>
                Clear All Workspace Colors
              </button>
            </>
          )}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => setShowPositionMenu((v) => !v)}>
            Tab Bar Position &#9656;
          </button>
          {showPositionMenu && (
            <div className="context-menu-sub">
              {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                <button key={pos} className={`context-menu-item sub${tabBarPosition === pos ? ' active-check' : ''}`} onClick={() => {
                  setTabBarPosition(pos);
                  closeMenu();
                }}>
                  {pos.charAt(0).toUpperCase() + pos.slice(1)} {tabBarPosition === pos ? '✓' : ''}
                </button>
              ))}
            </div>
          )}
          <button className="context-menu-item" onClick={() => {
            closeMenu();
            useTerminalStore.getState().toggleSettings();
          }}>
            Settings
          </button>
          <div className="context-menu-separator" />
          {config && config.shells.length > 0 && (
            <>
              <button className="context-menu-item" onClick={() => {
                if (config.shells.length === 1) {
                  setActiveWorkspace(ctxMenu.id);
                  createTerminal(config.shells[0].id);
                  closeMenu();
                } else {
                  setShowNewTerminalMenu((v) => !v);
                }
              }}>
                New Terminal {config.shells.length > 1 ? '▸' : ''}
              </button>
              {showNewTerminalMenu && config.shells.length > 1 && (
                <div className="context-menu-sub">
                  {config.shells.map((shell) => (
                    <button
                      key={shell.id}
                      className="context-menu-item sub"
                      onClick={() => {
                        setActiveWorkspace(ctxMenu.id);
                        createTerminal(shell.id);
                        closeMenu();
                      }}
                    >
                      {shell.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="context-menu-separator" />
            </>
          )}
          {workspaces.size > 1 && (
            <>
              <button className="context-menu-item danger" onClick={() => {
                handleCloseOthers(ctxMenu.id);
                closeMenu();
              }}>
                Close Others
              </button>
              <button className="context-menu-item danger" onClick={() => {
                handleClose(ctxMenu.id);
                closeMenu();
              }}>
                🗑 Close
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkspaceTabBar;
