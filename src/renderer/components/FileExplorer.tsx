import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTerminalStore } from '../state/terminal-store';

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;

const FileExplorer: React.FC = () => {
  const show = useTerminalStore((s) => s.showFileExplorer);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const focused = focusedId ? terminals.get(focusedId) : null;
  const terminalCwd = focused?.cwd || '';

  const [browsePath, setBrowsePath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [filter, setFilter] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const currentPath = browsePath || terminalCwd;

  // Sync browsePath when terminal CWD changes
  useEffect(() => {
    if (terminalCwd) setBrowsePath(terminalCwd);
  }, [terminalCwd]);

  const navigateTo = useCallback((dir: string) => {
    setBrowsePath(dir);
    setExpanded({});
    setChildren({});
    setFilter('');
  }, []);

  const navigateUp = useCallback(() => {
    if (!currentPath) return;
    const parent = currentPath.replace(/[/\\][^/\\]+[/\\]?$/, '') || currentPath.slice(0, 3); // e.g. C:\
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  // Load root directory
  useEffect(() => {
    if (!show || !currentPath) return;
    (window.terminalAPI as any).fileList(currentPath).then((entries: FileEntry[]) => {
      setFiles(showHidden ? entries : entries.filter((e: FileEntry) => !e.name.startsWith('.')));
    });
  }, [currentPath, show, showHidden]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [dirPath]: !prev[dirPath] };
      if (next[dirPath] && !children[dirPath]) {
        (window.terminalAPI as any).fileList(dirPath).then((entries: FileEntry[]) => {
          setChildren((c) => ({ ...c, [dirPath]: showHidden ? entries : entries.filter((e: FileEntry) => !e.name.startsWith('.')) }));
        });
      }
      return next;
    });
  }, [children]);

  const handleFileClick = useCallback((filePath: string) => {
    (window.terminalAPI as any).openPath(filePath);
  }, []);

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

  if (!show) return null;

  const q = filter.toLowerCase();

  const renderEntry = (entry: FileEntry, depth: number): React.ReactNode => {
    if (q && !entry.name.toLowerCase().includes(q)) {
      // If directory, check if any children match
      if (entry.isDirectory && children[entry.path]) {
        const hasMatch = children[entry.path].some((c) => c.name.toLowerCase().includes(q));
        if (!hasMatch) return null;
      } else if (!entry.isDirectory) {
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
          className={`file-entry${entry.isDirectory ? ' dir' : ' file'}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => {
            if (entry.isDirectory) {
              toggleDir(entry.path);
            } else {
              handleFileClick(entry.path);
            }
          }}
          onDoubleClick={() => {
            if (entry.isDirectory) {
              navigateTo(entry.path);
            }
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
            {children[entry.path].map((child) => renderEntry(child, depth + 1))}
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
      <div className="file-explorer-list">
        {files.map((entry) => renderEntry(entry, 0))}
        {files.length === 0 && <div className="dir-panel-empty">No files</div>}
      </div>
    </div>
  );
};

export default FileExplorer;
