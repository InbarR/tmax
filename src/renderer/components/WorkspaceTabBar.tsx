import React, { useState, useEffect, useRef } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { WorkspaceId } from '../state/types';

// Tab bar variant for tabMode === 'workspaces' (TASK-40). Each chip is a
// workspace; clicking a chip switches the entire grid. + creates a new
// workspace + a fresh terminal in it. Right-click → Rename / Close.

const WorkspaceTabBar: React.FC<{ vertical?: boolean; side?: 'left' | 'right' }> = ({ vertical }) => {
  const workspaces = useTerminalStore((s) => s.workspaces);
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useTerminalStore((s) => s.setActiveWorkspace);
  const createWorkspace = useTerminalStore((s) => s.createWorkspace);
  const renameWorkspace = useTerminalStore((s) => s.renameWorkspace);
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace);
  const createTerminal = useTerminalStore((s) => s.createTerminal);

  const [renamingId, setRenamingId] = useState<WorkspaceId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: WorkspaceId } | null>(null);
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
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [ctxMenu]);

  const commitRename = () => {
    if (renamingId) {
      renameWorkspace(renamingId, renameValue);
      setRenamingId(null);
    }
  };

  const handleNew = async () => {
    createWorkspace();
    // Spawn a fresh terminal in the newly active workspace so the user
    // doesn't land on an empty grid.
    await createTerminal();
  };

  const handleClose = (id: WorkspaceId) => {
    if (workspaces.size <= 1) {
      // Refuse to close the last workspace - matches the "always have a
      // pane on screen" UX from the rest of tmax.
      return;
    }
    closeWorkspace(id);
  };

  const orderedIds = [...workspaces.keys()];

  return (
    <div className={`workspace-tab-bar${vertical ? ' vertical' : ''}`} role="tablist">
      {orderedIds.map((id) => {
        const ws = workspaces.get(id)!;
        const isActive = id === activeWorkspaceId;
        const isRenaming = renamingId === id;
        return (
          <div
            key={id}
            className={`workspace-tab${isActive ? ' active' : ''}`}
            role="tab"
            aria-selected={isActive}
            data-workspace-id={id}
            onClick={() => { if (!isRenaming) setActiveWorkspace(id); }}
            onDoubleClick={() => {
              setRenameValue(ws.name);
              setRenamingId(id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, id });
            }}
            title={ws.name}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="workspace-tab-rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  else if (e.key === 'Escape') setRenamingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="workspace-tab-name">{ws.name}</span>
                {workspaces.size > 1 && (
                  <button
                    className="workspace-tab-close"
                    title="Close workspace"
                    aria-label="Close workspace"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose(id);
                    }}
                  >
                    ×
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <button
        className="workspace-tab-new"
        title="New workspace"
        aria-label="New workspace"
        onClick={handleNew}
      >
        +
      </button>
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="context-menu"
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 2000, minWidth: 180 }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const ws = workspaces.get(ctxMenu.id);
              if (ws) {
                setRenameValue(ws.name);
                setRenamingId(ctxMenu.id);
              }
              setCtxMenu(null);
            }}
          >
            ✏️ Rename workspace
          </button>
          {workspaces.size > 1 && (
            <button
              className="context-menu-item danger"
              onClick={() => {
                handleClose(ctxMenu.id);
                setCtxMenu(null);
              }}
            >
              🗑 Close workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkspaceTabBar;
