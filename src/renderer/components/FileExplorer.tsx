import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore } from '../state/terminal-store';
import MarkdownPreview from './MarkdownPreview';
import ZoomControls from './ZoomControls';
import { useZoom } from '../hooks/useZoom';

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;
const TEXT_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'txt', 'css', 'html', 'yml', 'yaml', 'toml', 'sh', 'bash', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'xml', 'svg', 'env', 'gitignore', 'dockerfile', 'makefile', 'cfg', 'ini', 'conf', 'log', 'sql', 'graphql', 'proto', 'lock']);

const FileExplorer: React.FC = () => {
  const show = useTerminalStore((s) => s.showFileExplorer);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const focused = focusedId ? terminals.get(focusedId) : null;
  const terminalCwd = focused?.cwd || '';
  const wslDistro = focused?.wslDistro;

  const [browsePath, setBrowsePath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [filter, setFilter] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ name: string; path: string; content: string } | null>(null);
  const [previewWidth, setPreviewWidth] = useState(50); // percentage
  const [previewSide, setPreviewSide] = useState<'right' | 'left'>('right');
  const previewOverlayRef = useRef<HTMLDivElement>(null);
  const { zoomPercent: previewZoom, zoomIn: previewZoomIn, zoomOut: previewZoomOut, zoomReset: previewZoomReset, fontSize: previewFontSize } = useZoom({ containerRef: previewOverlayRef });
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const currentPath = browsePath || terminalCwd;

  // Auto-focus the non-md preview panel when it opens
  useEffect(() => {
    if (preview && previewOverlayRef.current) {
      previewOverlayRef.current.focus();
    }
  }, [preview]);

  // Sync browsePath when terminal CWD changes
  useEffect(() => {
    if (terminalCwd) setBrowsePath(terminalCwd);
  }, [terminalCwd]);

  // Consume an external target path (e.g. from Worktree Panel "open in explorer")
  const targetPath = useTerminalStore((s) => s.fileExplorerTargetPath);
  useEffect(() => {
    if (!targetPath) return;
    setBrowsePath(targetPath);
    setExpanded({});
    setChildren({});
    setFilter('');
    useTerminalStore.setState({ fileExplorerTargetPath: null });
  }, [targetPath]);

  const navigateTo = useCallback((dir: string) => {
    setBrowsePath(dir);
    setExpanded({});
    setChildren({});
    setFilter('');
  }, []);

  const navigateUp = useCallback(() => {
    if (!currentPath) return;
    const parent = currentPath.replace(/[/\\][^/\\]+[/\\]?$/, '') || currentPath.slice(0, 3);
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  // Load root directory
  useEffect(() => {
    if (!show || !currentPath) return;
    (window.terminalAPI as any).fileList(currentPath, wslDistro).then((entries: FileEntry[]) => {
      setFiles(showHidden ? entries : entries.filter((e: FileEntry) => !e.name.startsWith('.')));
    });
  }, [currentPath, show, showHidden, wslDistro]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [dirPath]: !prev[dirPath] };
      if (next[dirPath] && !children[dirPath]) {
        (window.terminalAPI as any).fileList(dirPath, wslDistro).then((entries: FileEntry[]) => {
          setChildren((c) => ({ ...c, [dirPath]: showHidden ? entries : entries.filter((e: FileEntry) => !e.name.startsWith('.')) }));
        });
      }
      return next;
    });
  }, [children, wslDistro]);

  const openFileExternally = useCallback((filePath: string) => {
    if (wslDistro && filePath.startsWith('/')) {
      const uncPath = `\\\\wsl.localhost\\${wslDistro}${filePath.replace(/\//g, '\\')}`;
      (window.terminalAPI as any).openPath(uncPath);
    } else {
      (window.terminalAPI as any).openPath(filePath);
    }
  }, [wslDistro]);

  const handleFileClick = useCallback((filePath: string, fileName: string) => {
    // Try to preview any file — fileRead returns null for binary/large files
    (window.terminalAPI as any).fileRead(filePath, wslDistro).then((content: string | null) => {
      if (content !== null) {
        setPreview({ name: fileName, path: filePath, content });
      } else {
        openFileExternally(filePath);
      }
    }).catch(() => {
      openFileExternally(filePath);
    });
  }, [wslDistro, openFileExternally]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (moveEvent.clientX - startX)));
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

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  if (!show) return null;

  const q = filter.toLowerCase();

  const renderEntry = (entry: FileEntry, depth: number, parentMatches?: boolean): React.ReactNode => {
    const nameMatches = !q || entry.name.toLowerCase().includes(q);
    if (!nameMatches && !parentMatches) {
      if (entry.isDirectory && children[entry.path]) {
        const hasMatch = children[entry.path].some((c) => c.name.toLowerCase().includes(q));
        if (!hasMatch) return null;
      } else if (!entry.isDirectory) {
        return null;
      } else {
        // Unloaded directory that doesn't match — hide it
        return null;
      }
    }

    const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() : '';
    const fileIconClass = entry.isDirectory
      ? (expanded[entry.path] ? 'folder-open' : 'folder')
      : (ext || 'default');

    return (
      <div key={entry.path}>
        <div
          className={`file-entry${entry.isDirectory ? ' dir' : ' file'}${preview?.path === entry.path ? ' previewing' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => {
            if (entry.isDirectory) {
              toggleDir(entry.path);
            } else {
              handleFileClick(entry.path, entry.name);
            }
          }}
          onDoubleClick={() => {
            if (entry.isDirectory) {
              navigateTo(entry.path);
            } else {
              openFileExternally(entry.path);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCtxMenu({ x: e.clientX, y: e.clientY, entry });
          }}
        >
          {entry.isDirectory && (
            <span className="file-chevron">{expanded[entry.path] ? '\u25BC' : '\u25B6'}</span>
          )}
          <span className={`file-type-icon ${fileIconClass}`} />
          <span className="file-name">{entry.name}</span>
        </div>
        {entry.isDirectory && expanded[entry.path] && children[entry.path] && (
          <div className="file-children" style={{ borderLeft: '1px solid var(--border-color)', marginLeft: 19 + depth * 16 }}>
            {children[entry.path].map((child) => renderEntry(child, depth + 1, nameMatches))}
          </div>
        )}
      </div>
    );
  };

  const pathParts = currentPath.split(/[/\\]/).filter(Boolean);
  // On Windows, first part is drive letter like "C:"
  const breadcrumbs = pathParts.map((part, i) => ({
    label: part,
    path: pathParts.slice(0, i + 1).join('\\') + (i === 0 && part.endsWith(':') ? '\\' : ''),
  }));

  return (
    <div className={`file-explorer-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="file-explorer-resize" onMouseDown={handleResizeStart} />
      <div className="file-explorer-header">
        <div className="file-explorer-nav">
          <button className="file-explorer-nav-btn" onClick={() => { setExpanded({}); }} title="Collapse all">&#8722;</button>
          <button className="file-explorer-nav-btn" onClick={navigateUp} title="Go up">&#8593;</button>
          <button className="file-explorer-nav-btn" onClick={() => navigateTo(terminalCwd)} title="Go to terminal CWD">&#8962;</button>
        </div>
        {editingPath ? (
          <input
            ref={pathInputRef}
            className="file-explorer-path-input"
            value={pathInputValue}
            onChange={(e) => setPathInputValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && pathInputValue.trim()) {
                navigateTo(pathInputValue.trim());
                setEditingPath(false);
              }
              if (e.key === 'Escape') setEditingPath(false);
            }}
            onBlur={() => setEditingPath(false)}
          />
        ) : (
          <div
            className="file-explorer-breadcrumbs"
            onClick={() => { setEditingPath(true); setPathInputValue(currentPath); requestAnimationFrame(() => pathInputRef.current?.focus()); }}
            title="Click to edit path"
          >
            {breadcrumbs.map((bc, i) => (
              <span key={i}>
                <span
                  className="file-explorer-crumb"
                  onClick={(e) => { e.stopPropagation(); navigateTo(bc.path); }}
                >{bc.label}</span>
                {i < breadcrumbs.length - 1 && <span className="file-explorer-sep">/</span>}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button className="file-explorer-nav-btn" onClick={() => setShowHidden((v) => !v)} title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}>{showHidden ? '\u25C9' : '\u25CB'}</button>
          <button className="dir-panel-close" onClick={() => useTerminalStore.getState().toggleFileExplorer()}>&#10005;</button>
        </div>
      </div>
      <input
        ref={filterRef}
        className="dir-panel-search"
        type="text"
        placeholder="Filter files..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); e.stopPropagation(); } }}
      />
      <div className="file-explorer-list" style={{ flex: 1 }}>
        {files.map((entry) => renderEntry(entry, 0))}
        {files.length === 0 && <div className="dir-panel-empty">No files</div>}
      </div>
      {preview && ReactDOM.createPortal(
        /\.md$/i.test(preview.name) ? (
          <MarkdownPreview
            content={preview.content}
            fileName={preview.name}
            filePath={preview.path}
            onClose={() => setPreview(null)}
            onOpenExternally={openFileExternally}
            side={previewSide}
            onToggleSide={() => setPreviewSide((s) => s === 'right' ? 'left' : 'right')}
            width={`${previewWidth}%`}
          />
        ) : (
        <div
          ref={previewOverlayRef}
          className={`file-preview-overlay ${previewSide}`}
          style={{
            width: `${previewWidth}%`,
            ...(previewSide === 'left' ? { left: width + 1 } : {}),
          }}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreview(null); }}
        >
          <div
            className="file-preview-resize"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = previewWidth;
              const handleMove = (me: MouseEvent) => {
                const delta = previewSide === 'right' ? startX - me.clientX : me.clientX - startX;
                const newWidth = Math.max(20, Math.min(80, startWidth + (delta / window.innerWidth) * 100));
                setPreviewWidth(newWidth);
              };
              const handleUp = () => {
                window.removeEventListener('mousemove', handleMove);
                window.removeEventListener('mouseup', handleUp);
              };
              window.addEventListener('mousemove', handleMove);
              window.addEventListener('mouseup', handleUp);
            }}
          />
          <div className="file-preview-sidebar">
            <div className="file-preview-header">
              <span className="file-preview-name">{preview.name}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                <ZoomControls zoomPercent={previewZoom} onZoomIn={previewZoomIn} onZoomOut={previewZoomOut} onZoomReset={previewZoomReset} />
                <button className="file-preview-btn" onClick={() => openFileExternally(preview.path)} title="Open externally">&#8599;</button>
                <button className="file-preview-btn" onClick={() => setPreviewSide((s) => s === 'right' ? 'left' : 'right')} title="Move to other side">{previewSide === 'right' ? '\u25C0' : '\u25B6'}</button>
                <button className="file-preview-btn close" onClick={() => setPreview(null)} title="Close (Esc)">&#10005;</button>
              </div>
            </div>
            <pre className="file-preview-content" style={{ fontSize: previewFontSize(12) }}>{preview.content}</pre>
          </div>
        </div>
        ),
        document.body,
      )}
      {ctxMenu && (
        <div ref={ctxRef} className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          {!ctxMenu.entry.isDirectory && (
            <button className="context-menu-item" onClick={() => {
              handleFileClick(ctxMenu.entry.path, ctxMenu.entry.name);
              setCtxMenu(null);
            }}>
              &#128065; Preview
            </button>
          )}
          <button className="context-menu-item" onClick={() => {
            if (ctxMenu.entry.isDirectory) {
              openFileExternally(ctxMenu.entry.path);
            } else {
              openFileExternally(ctxMenu.entry.path);
            }
            setCtxMenu(null);
          }}>
            {ctxMenu.entry.isDirectory ? '\uD83D\uDCC2 Open Folder' : '\u2197 Open in Editor'}
          </button>
          {ctxMenu.entry.isDirectory && (
            <button className="context-menu-item" onClick={() => {
              navigateTo(ctxMenu.entry.path);
              setCtxMenu(null);
            }}>
              &#128194; Browse Here
            </button>
          )}
          {ctxMenu.entry.isDirectory && (
            <button className="context-menu-item" onClick={() => {
              // cd to this directory in the focused terminal
              const tid = useTerminalStore.getState().focusedTerminalId;
              if (tid) {
                const cdPath = wslDistro ? ctxMenu.entry.path : ctxMenu.entry.path;
                window.terminalAPI.writePty(tid, `cd "${cdPath}"\r`);
              }
              setCtxMenu(null);
            }}>
              &#9654; CD Here
            </button>
          )}
          <button className="context-menu-item" onClick={() => {
            window.terminalAPI.clipboardWrite(ctxMenu.entry.path);
            setCtxMenu(null);
          }}>
            &#128203; Copy Path
          </button>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
