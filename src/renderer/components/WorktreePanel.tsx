import React, { useState, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { RepoWorktrees, WorktreeInfo } from '../../shared/worktree-types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;

const WorktreePanel: React.FC = () => {
  const show = useTerminalStore((s) => s.showWorktreePanel);
  const repos = useTerminalStore((s) => s.worktreeRepos);
  const loading = useTerminalStore((s) => s.worktreeLoading);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + moveEvent.clientX - startX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const toggleCollapse = useCallback((gitRoot: string) => {
    setCollapsed((prev) => ({ ...prev, [gitRoot]: !prev[gitRoot] }));
  }, []);

  const cdToWorktree = useCallback((wtPath: string) => {
    useTerminalStore.getState().cdToDir(wtPath);
  }, []);

  const repoName = (gitRoot: string) => {
    const parts = gitRoot.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] || gitRoot;
  };

  const branchLabel = (wt: WorktreeInfo) => {
    if (wt.bare) return '(bare)';
    if (wt.detached) return `(detached ${wt.head?.slice(0, 7) ?? ''})`;
    return wt.branch ?? '(unknown)';
  };

  const worktreeName = (wt: WorktreeInfo) => {
    const parts = wt.path.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] || wt.path;
  };

  if (!show) return null;

  return (
    <div className={`wt-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="wt-panel-resize" onMouseDown={handleResizeStart} />
      <div className="wt-panel-header">
        <span>Worktrees</span>
        <div className="wt-panel-header-actions">
          <button
            className="wt-panel-refresh"
            onClick={() => useTerminalStore.getState().loadWorktrees()}
            title="Refresh worktrees"
          >
            &#x21bb;
          </button>
          <button
            className="wt-panel-close"
            onClick={() => useTerminalStore.getState().toggleWorktreePanel()}
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="wt-panel-list">
        {loading && (
          <div className="wt-panel-empty">Loading worktrees…</div>
        )}

        {!loading && repos.length === 0 && (
          <div className="wt-panel-empty">
            No git repositories with worktrees found.<br />
            Add directories via the Directories panel first.
          </div>
        )}

        {!loading && repos.map((repo) => {
          const isCollapsed = collapsed[repo.gitRoot] !== false; // collapsed by default
          return (
            <div key={repo.gitRoot} className="wt-repo-group">
              <div
                className="wt-repo-header"
                onClick={() => toggleCollapse(repo.gitRoot)}
                title={repo.gitRoot}
              >
                <span className="wt-repo-chevron">{isCollapsed ? '▸' : '▾'}</span>
                <span className="wt-repo-name">{repoName(repo.gitRoot)}</span>
                <span className="wt-repo-count">{repo.worktrees.length}</span>
              </div>

              {!isCollapsed && (
                <div className="wt-worktree-list">
                  {repo.worktrees.map((wt) => (
                    <div
                      key={wt.path}
                      className="wt-worktree-item"
                      onClick={() => cdToWorktree(wt.path)}
                      title={wt.path}
                    >
                      <div className="wt-worktree-info">
                        <span className="wt-worktree-name">{worktreeName(wt)}</span>
                        <span className="wt-worktree-branch">
                          {branchLabel(wt)}
                          {wt.locked && ' 🔒'}
                        </span>
                      </div>
                      <span className="wt-worktree-path">{wt.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorktreePanel;
