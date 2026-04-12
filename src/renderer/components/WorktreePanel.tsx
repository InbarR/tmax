import React, { useState, useCallback } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { RepoWorktrees, WorktreeInfo } from '../../shared/worktree-types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;

interface CreateWorktreeModal {
  repoPath: string;
  branches: string[];
}

const WorktreePanel: React.FC = () => {
  const show = useTerminalStore((s) => s.showWorktreePanel);
  const repos = useTerminalStore((s) => s.worktreeRepos);
  const loading = useTerminalStore((s) => s.worktreeLoading);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [createModal, setCreateModal] = useState<CreateWorktreeModal | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');

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

  const toggleRepo = useCallback((gitRoot: string) => {
    const store = useTerminalStore.getState();
    const updated = store.worktreeRepos.map((r) =>
      r.gitRoot === gitRoot ? { ...r, isExpanded: !r.isExpanded } : r,
    );
    useTerminalStore.setState({ worktreeRepos: updated });
  }, []);

  const cdToWorktree = useCallback((wtPath: string) => {
    useTerminalStore.getState().cdToDir(wtPath);
  }, []);

  const openFolder = useCallback((folderPath: string) => {
    (window.terminalAPI as any).openPath(folderPath);
  }, []);

  const showCreateWorktree = useCallback(async (repoPath: string) => {
    const branches = await (window.terminalAPI as any).getBranches(repoPath);
    setCreateModal({ repoPath, branches });
    setNewBranchName('');
    setBaseBranch(branches[0] || 'main');
  }, []);

  const handleCreateWorktree = useCallback(async () => {
    if (!createModal || !newBranchName.trim()) return;
    const result = await useTerminalStore.getState().createWorktree(
      createModal.repoPath,
      newBranchName.trim(),
      baseBranch,
    );
    if (result.success) {
      setCreateModal(null);
    } else {
      alert('Error creating worktree: ' + result.error);
    }
  }, [createModal, newBranchName, baseBranch]);

  const handleDeleteWorktree = useCallback(async (repoPath: string, wtPath: string) => {
    if (!confirm(`Delete worktree?\n${wtPath}`)) return;
    const result = await useTerminalStore.getState().deleteWorktree(repoPath, wtPath);
    if (!result.success) {
      alert('Error deleting worktree: ' + result.error);
    }
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
            No git repositories found.<br />
            Add directories via the Directories panel first.
          </div>
        )}

        {!loading && repos.map((repo) => (
          <div key={repo.gitRoot} className="wt-repo-group">
            <div
              className={`wt-repo-header${repo.isExpanded ? ' expanded' : ''}`}
              onClick={() => toggleRepo(repo.gitRoot)}
              title={repo.gitRoot}
            >
              <span className="wt-repo-chevron">{repo.isExpanded ? '▾' : '▸'}</span>
              <span className="wt-repo-name">📁 {repoName(repo.gitRoot)}</span>
              <div className="wt-repo-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="wt-action-btn"
                  onClick={() => showCreateWorktree(repo.gitRoot)}
                  title="New Worktree"
                >
                  🌿
                </button>
              </div>
            </div>

            {repo.isExpanded && (
              <div className="wt-worktree-list">
                {repo.worktrees.map((wt) => (
                  <div key={wt.path} className="wt-worktree-item" title={wt.path}>
                    <div className="wt-worktree-header">
                      <span>{wt.isWorktree ? '🌿' : '📂'}</span>
                      <span className="wt-worktree-branch">{branchLabel(wt)}</span>
                      {wt.locked && <span title="Locked">🔒</span>}
                    </div>
                    <div className="wt-worktree-path">{wt.path}</div>
                    <div className="wt-worktree-actions">
                      <button
                        className="wt-action-btn"
                        onClick={() => cdToWorktree(wt.path)}
                        title="cd to this worktree"
                      >
                        ▶ cd
                      </button>
                      <button
                        className="wt-action-btn"
                        onClick={() => openFolder(wt.path)}
                        title="Open in Explorer"
                      >
                        📂
                      </button>
                      {wt.isWorktree && (
                        <button
                          className="wt-action-btn wt-action-danger"
                          onClick={() => handleDeleteWorktree(repo.gitRoot, wt.path)}
                          title="Delete Worktree"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Worktree Modal */}
      {createModal && (
        <div className="wt-modal-overlay" onClick={() => setCreateModal(null)}>
          <div className="wt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Worktree</h3>
            <label className="wt-modal-label">Branch Name</label>
            <input
              className="wt-modal-input"
              type="text"
              placeholder="feature/my-feature"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorktree(); if (e.key === 'Escape') setCreateModal(null); }}
              autoFocus
            />
            <label className="wt-modal-label">Base Branch</label>
            <select
              className="wt-modal-input"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
            >
              {createModal.branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <div className="wt-modal-actions">
              <button className="wt-action-btn" onClick={() => setCreateModal(null)}>Cancel</button>
              <button className="wt-action-btn wt-action-primary" onClick={handleCreateWorktree}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorktreePanel;
