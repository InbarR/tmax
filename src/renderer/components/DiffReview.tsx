import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type {
  DiffMode,
  DiffFile,
  DiffResult,
  DiffComment,
  AnnotatedFile,
  AnnotatedLine,
  DiffLineType,
} from '../../shared/diff-types';
import '../styles/diff-review.css';

// ── Helpers ──────────────────────────────────────────────────────────

function groupFilesByDir(files: DiffFile[]): Map<string, DiffFile[]> {
  const groups = new Map<string, DiffFile[]>();
  for (const file of files) {
    const dir = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : '.';
    const existing = groups.get(dir);
    if (existing) existing.push(file);
    else groups.set(dir, [file]);
  }
  return groups;
}

function fileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.substring(idx + 1) : path;
}

function fileStatusIcon(status: string): string {
  switch (status) {
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    default: return 'M';
  }
}

function formatCommentForPaste(comments: DiffComment[]): string {
  if (comments.length === 0) return '';
  const lines: string[] = ['Review comments on working changes:', ''];

  // Group by file
  const byFile = new Map<string, DiffComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath);
    if (existing) existing.push(c);
    else byFile.set(c.filePath, [c]);
  }

  for (const [filePath, fileComments] of byFile) {
    for (const c of fileComments) {
      const range = c.startLine === c.endLine
        ? `${c.startLine}`
        : `${c.startLine}-${c.endLine}`;
      const colRange = c.startCol != null && c.endCol != null
        ? `:${c.startCol}-${c.endCol}`
        : '';
      const lineTypeLabel = c.lineType === 'added' ? 'new' : c.lineType === 'removed' ? 'old' : 'unchanged';
      lines.push(`[${filePath}:${range}${colRange}] (${lineTypeLabel})`);
      // Quote the selected text
      const textLines = c.selectedText.split('\n');
      for (const tl of textLines) {
        lines.push(`> ${tl}`);
      }
      lines.push(c.comment);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── FileTree component ───────────────────────────────────────────────

interface FileTreeProps {
  files: DiffFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ files, selectedFile, onSelectFile }) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  const filteredFiles = useMemo(() => {
    if (!filter) return files;
    const q = filter.toLowerCase();
    return files.filter(f => f.path.toLowerCase().includes(q) || fileName(f.path).toLowerCase().includes(q));
  }, [files, filter]);

  const grouped = useMemo(() => groupFilesByDir(filteredFiles), [filteredFiles]);

  const toggleDir = (dir: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  return (
    <div className="diff-file-tree">
      <div className="diff-file-tree-header">Changes ({filteredFiles.length}/{files.length})</div>
      <div className="diff-file-tree-search">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter files..."
          onKeyDown={e => {
            if (e.key === 'Escape') { setFilter(''); e.stopPropagation(); }
          }}
        />
        {filter && <button className="diff-filter-clear" onClick={() => { setFilter(''); filterRef.current?.focus(); }}>&#10005;</button>}
      </div>
      {Array.from(grouped.entries()).map(([dir, dirFiles]) => (
        <div key={dir} className="diff-dir-group">
          <div className="diff-dir-header" onClick={() => toggleDir(dir)}>
            <span className={`diff-dir-chevron ${collapsedDirs.has(dir) ? 'collapsed' : ''}`}>&#9660;</span>
            <span>{dir === '.' ? '/' : dir}</span>
          </div>
          {!collapsedDirs.has(dir) && dirFiles.map(file => (
            <div
              key={file.path}
              className={`diff-file-item ${selectedFile === file.path ? 'active' : ''}`}
              onClick={() => onSelectFile(file.path)}
            >
              <span className={`diff-file-icon ${file.status}`}>{fileStatusIcon(file.status)}</span>
              <span className="diff-file-name">{fileName(file.path)}</span>
              <span className="diff-file-stats">
                {file.additions > 0 && <span className="additions">+{file.additions}</span>}
                {file.additions > 0 && file.deletions > 0 && ' '}
                {file.deletions > 0 && <span className="deletions">-{file.deletions}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── FileViewer component ─────────────────────────────────────────────

interface FileViewerProps {
  filePath: string | null;
  annotatedFile: AnnotatedFile | null;
  loading: boolean;
  comments: DiffComment[];
  onAddComment: (comment: DiffComment) => void;
}

const FileViewer: React.FC<FileViewerProps> = ({ filePath, annotatedFile, loading, comments, onAddComment }) => {
  const [commentPopupLine, setCommentPopupLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  // Reset selection when file changes
  useEffect(() => {
    setCommentPopupLine(null);
    setCommentText('');
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [filePath]);

  // Focus input when popup opens
  useEffect(() => {
    if (commentPopupLine !== null) {
      setTimeout(() => commentInputRef.current?.focus(), 50);
    }
  }, [commentPopupLine]);

  const handleLineClick = useCallback((lineIdx: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionStart !== null) {
      // Extend selection
      setSelectionEnd(lineIdx);
      setCommentPopupLine(lineIdx);
    } else {
      // Start new selection
      setSelectionStart(lineIdx);
      setSelectionEnd(lineIdx);
      setCommentPopupLine(lineIdx);
      setCommentText('');
    }
  }, [selectionStart]);

  const submitComment = useCallback(() => {
    if (!commentText.trim() || !annotatedFile || !filePath) return;

    const start = Math.min(selectionStart ?? commentPopupLine ?? 0, selectionEnd ?? commentPopupLine ?? 0);
    const end = Math.max(selectionStart ?? commentPopupLine ?? 0, selectionEnd ?? commentPopupLine ?? 0);

    const selectedLines = annotatedFile.lines.slice(start, end + 1);
    const selectedText = selectedLines.map(l => l.content).join('\n');
    const startLine = selectedLines[0]?.lineNumber ?? 0;
    const endLine = selectedLines[selectedLines.length - 1]?.lineNumber ?? startLine;
    const lineType = selectedLines[0]?.type ?? 'unchanged';

    const comment: DiffComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filePath,
      startLine: startLine === -1 ? 0 : startLine,
      endLine: endLine === -1 ? 0 : endLine,
      lineType,
      selectedText,
      comment: commentText.trim(),
    };

    onAddComment(comment);
    setCommentPopupLine(null);
    setCommentText('');
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [commentText, annotatedFile, filePath, selectionStart, selectionEnd, commentPopupLine, onAddComment]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComment();
    } else if (e.key === 'Escape') {
      setCommentPopupLine(null);
      setCommentText('');
    }
  }, [submitComment]);

  if (!filePath) {
    return <div className="diff-empty-state">Select a file to view changes</div>;
  }

  if (loading) {
    return (
      <div className="diff-loading">
        <div className="diff-loading-spinner" />
        Loading file...
      </div>
    );
  }

  if (!annotatedFile) {
    return <div className="diff-empty-state">No changes to display</div>;
  }

  const selStart = Math.min(selectionStart ?? Infinity, selectionEnd ?? Infinity);
  const selEnd = Math.max(selectionStart ?? -1, selectionEnd ?? -1);
  const lineCommentMap = new Map<string, DiffComment[]>();
  for (const c of comments) {
    if (c.filePath === filePath) {
      const key = `${c.startLine}`;
      const existing = lineCommentMap.get(key);
      if (existing) existing.push(c);
      else lineCommentMap.set(key, [c]);
    }
  }

  return (
    <div className="diff-file-viewer">
      <div className="diff-file-viewer-header">
        <span className="file-icon">&#128196;</span>
        <span className="file-path">{filePath}</span>
        <div className="diff-file-viewer-header-actions">
          <button
            title="Copy file path"
            onClick={() => window.terminalAPI.clipboardWrite(filePath)}
          >&#128203;</button>
        </div>
      </div>
      <div className="diff-file-lines" ref={linesRef}>
        {annotatedFile.lines.map((line, idx) => {
          const isSelected = idx >= selStart && idx <= selEnd;
          const hasComment = lineCommentMap.has(String(line.lineNumber));
          return (
            <React.Fragment key={idx}>
              <div
                className={`diff-line ${line.type} ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handleLineClick(idx, e)}
              >
                <span className="diff-line-number">
                  {line.lineNumber === -1 ? '' : line.lineNumber}
                </span>
                <span className="diff-line-marker">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="diff-line-content">{line.content}</span>
                {hasComment && (
                  <span className="diff-line-comment-indicator" title="Has comment">&#128172;</span>
                )}
              </div>
              {commentPopupLine === idx && (
                <div className="diff-comment-popup" style={{ top: (idx + 1) * 20 }}>
                  <button className="diff-comment-popup-close" onClick={() => { setCommentPopupLine(null); setCommentText(''); }}>&#10005;</button>
                  <input
                    ref={commentInputRef}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a comment..."
                  />
                  <button className="diff-comment-popup-add" onClick={submitComment} title="Add comment">+</button>
                  <button className="diff-comment-popup-send" onClick={submitComment} title="Submit">&#9650;</button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ── CommentsPanel component ──────────────────────────────────────────

interface CommentsPanelProps {
  comments: DiffComment[];
  agentLabel: string;
  onRemoveComment: (id: string) => void;
  onClearComments: () => void;
  onSendComments: () => void;
}

const CommentsPanel: React.FC<CommentsPanelProps> = ({ comments, agentLabel, onRemoveComment, onClearComments, onSendComments }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (comments.length === 0) return null;

  // Group by file
  const byFile = new Map<string, DiffComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath);
    if (existing) existing.push(c);
    else byFile.set(c.filePath, [c]);
  }

  return (
    <div className="diff-comments-panel">
      <div className="diff-comments-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="diff-comments-header-left">
          <span>{collapsed ? '&#9654;' : '&#9660;'}</span>
          <span>&#128172; {comments.length} Comment{comments.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="diff-comments-header-right">
          <button className="diff-comments-clear-btn" onClick={(e) => { e.stopPropagation(); onClearComments(); }}>
            &#128465; Clear
          </button>
          <button className="diff-comments-send-btn" onClick={(e) => { e.stopPropagation(); onSendComments(); }} disabled={comments.length === 0}>
            &#9992; Send {comments.length} to {agentLabel}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="diff-comments-list">
          {Array.from(byFile.entries()).map(([filePath, fileComments]) => (
            <div key={filePath} className="diff-comment-entry">
              <div className="diff-comment-file-header">
                {fileName(filePath)} ({fileComments.length})
              </div>
              {fileComments.map(c => (
                <div key={c.id} className="diff-comment-item">
                  <span className="diff-comment-item-icon">&#128172;</span>
                  <div className="diff-comment-item-content">
                    <div className="diff-comment-item-location">
                      Line {c.startLine === c.endLine ? c.startLine : `${c.startLine}-${c.endLine}`}
                      {' '}({c.lineType === 'added' ? 'new' : c.lineType === 'removed' ? 'old' : 'unchanged'})
                    </div>
                    {c.selectedText && (
                      <div className="diff-comment-item-selected-text">{c.selectedText}</div>
                    )}
                    <div className="diff-comment-item-text">{c.comment}</div>
                  </div>
                  <button
                    className="diff-comment-item-remove"
                    onClick={() => onRemoveComment(c.id)}
                    title="Remove comment"
                  >&#10005;</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main DiffReview component ────────────────────────────────────────

const DiffReview: React.FC = () => {
  const diffReviewOpen = useTerminalStore(s => s.diffReviewOpen);
  const diffReviewTerminalId = useTerminalStore(s => s.diffReviewTerminalId);
  const diffReviewMode = useTerminalStore(s => s.diffReviewMode);
  const closeDiffReview = useTerminalStore(s => s.closeDiffReview);
  const setDiffReviewMode = useTerminalStore(s => s.setDiffReviewMode);
  const terminalCwd = useTerminalStore(s =>
    diffReviewTerminalId ? s.terminals.get(diffReviewTerminalId)?.cwd ?? '' : ''
  );
  const agentLabel = useTerminalStore(s => {
    if (!diffReviewTerminalId) return 'Agent';
    const t = s.terminals.get(diffReviewTerminalId);
    if (!t) return 'Agent';
    // Primary: check session lists via aiSessionId (authoritative)
    if (t.aiSessionId) {
      if (s.copilotSessions.some(x => x.id === t.aiSessionId)) return 'Copilot';
      if (s.claudeCodeSessions.some(x => x.id === t.aiSessionId)) return 'Claude';
    }
    // Fallback: process/title heuristic (before session linking completes)
    const proc = (t.lastProcess ?? '').toLowerCase();
    const title = (t.title ?? '').toLowerCase();
    if (proc.includes('copilot') || title.includes('copilot')) return 'Copilot';
    if (proc.includes('claude') || proc === 'cc' || title.includes('claude')) return 'Claude';
    return 'Agent';
  });

  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [annotatedFile, setAnnotatedFile] = useState<AnnotatedFile | null>(null);
  const [comments, setComments] = useState<DiffComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitCwd, setGitCwd] = useState<string | null>(null);

  // Resolve git root and load diff — uses renderer-tracked terminal CWD
  const loadDiff = useCallback(async (mode: DiffMode) => {
    if (!diffReviewTerminalId || !terminalCwd) return;
    setLoading(true);
    setError(null);
    try {
      const root = await window.terminalAPI.diffResolveGitRoot(terminalCwd);
      setGitCwd(root);

      const result = await window.terminalAPI.diffGetDiff(root, mode);
      setDiffResult(result);

      // Auto-select first file
      if (result.files.length > 0 && !selectedFile) {
        setSelectedFile(result.files[0].path);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load diff');
    } finally {
      setLoading(false);
    }
  }, [diffReviewTerminalId, terminalCwd, selectedFile]);

  // Load diff on open, mode change, or terminal switch
  useEffect(() => {
    if (diffReviewOpen && diffReviewTerminalId) {
      setSelectedFile(null);
      setAnnotatedFile(null);
      setComments([]);
      setGitCwd(null);
      setDiffResult(null);
      loadDiff(diffReviewMode);
    }
  }, [diffReviewOpen, diffReviewMode, diffReviewTerminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load annotated file when selection changes
  useEffect(() => {
    if (!selectedFile || !gitCwd) {
      setAnnotatedFile(null);
      return;
    }
    let cancelled = false;
    setFileLoading(true);
    window.terminalAPI.diffGetAnnotatedFile(gitCwd, selectedFile, diffReviewMode)
      .then(result => {
        if (!cancelled) {
          setAnnotatedFile(result);
          setFileLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotatedFile(null);
          setFileLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [selectedFile, gitCwd, diffReviewMode]);

  // Escape to close
  useEffect(() => {
    if (!diffReviewOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDiffReview();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [diffReviewOpen, closeDiffReview]);

  const addComment = useCallback((comment: DiffComment) => {
    setComments(prev => [...prev, comment]);
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearComments = useCallback(() => {
    setComments([]);
  }, []);

  const sendComments = useCallback(() => {
    if (comments.length === 0 || !diffReviewTerminalId) return;
    const text = formatCommentForPaste(comments);
    // Bracketed paste: \x1b[200~ ... \x1b[201~
    const bracketedPaste = `\x1b[200~${text}\x1b[201~`;
    window.terminalAPI.writePty(diffReviewTerminalId, bracketedPaste);
    closeDiffReview();
  }, [comments, diffReviewTerminalId, closeDiffReview]);

  if (!diffReviewOpen || !diffReviewTerminalId) return null;

  return (
    <div className="diff-review-overlay">
      {/* Left: dimmed backdrop — existing terminal shows through underneath */}
      <div className="diff-review-backdrop" onClick={closeDiffReview} />

      {/* Right: Diff panel */}
      <div className="diff-review-panel">
        {/* Top bar */}
        <div className="diff-top-bar">
          <div className="diff-top-bar-left">
            {comments.length > 0 && (
              <span className="diff-comment-badge">&#128172; {comments.length}</span>
            )}
            {diffResult && (
              <>
                <span className="diff-commit-hash">{diffResult.commitHash}</span>
                <span className="diff-branch-name">[{diffResult.branch}]</span>
              </>
            )}
          </div>
          <div className="diff-top-bar-right">
            {(['unstaged', 'staged', 'branch'] as DiffMode[]).map(mode => (
              <button
                key={mode}
                className={`diff-mode-btn ${diffReviewMode === mode ? 'active' : ''}`}
                onClick={() => setDiffReviewMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <button className="diff-close-btn" onClick={closeDiffReview}>Close</button>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <div className="diff-empty-state" style={{ color: '#f38ba8' }}>{error}</div>
        ) : loading ? (
          <div className="diff-loading">
            <div className="diff-loading-spinner" />
            Loading diff...
          </div>
        ) : (
          <>
            <div className="diff-content">
              <FileTree
                files={diffResult?.files ?? []}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
              <FileViewer
                filePath={selectedFile}
                annotatedFile={annotatedFile}
                loading={fileLoading}
                comments={comments}
                onAddComment={addComment}
              />
            </div>
            <CommentsPanel
              comments={comments}
              agentLabel={agentLabel}
              onRemoveComment={removeComment}
              onClearComments={clearComments}
              onSendComments={sendComments}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DiffReview;
