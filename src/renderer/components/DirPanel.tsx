import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';

interface DirContextMenu {
  x: number;
  y: number;
  dir: string;
  isFav: boolean;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 260;

const DirPanel: React.FC = () => {
  const show = useTerminalStore((s) => s.showDirPicker);
  const favoriteDirs = useTerminalStore((s) => s.favoriteDirs);
  const recentDirs = useTerminalStore((s) => s.recentDirs);
  const [query, setQuery] = useState('');
  const [addingFav, setAddingFav] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<DirContextMenu | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const favInputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [favValue, setFavValue] = useState('');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);

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

  const allDirs = useMemo(() => {
    const favSet = new Set(favoriteDirs);
    const items: { dir: string; isFav: boolean }[] = [
      ...favoriteDirs.map((dir) => ({ dir, isFav: true })),
      ...recentDirs.filter((d) => !favSet.has(d)).map((dir) => ({ dir, isFav: false })),
    ];
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.dir.toLowerCase().includes(q));
  }, [favoriteDirs, recentDirs, query]);

  useEffect(() => {
    if (show) {
      setQuery('');
      setSelectedIndex(0);
      setAddingFav(false);
      setCtxMenu(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [show]);

  useEffect(() => {
    if (selectedIndex >= allDirs.length) setSelectedIndex(Math.max(0, allDirs.length - 1));
  }, [allDirs.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.dir-panel-item');
      const item = items[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (addingFav) requestAnimationFrame(() => favInputRef.current?.focus());
  }, [addingFav]);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const selectDir = useCallback((dir: string) => {
    useTerminalStore.getState().cdToDir(dir);
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allDirs.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (allDirs[selectedIndex]) {
          selectDir(allDirs[selectedIndex].dir);
        } else if (query.trim()) {
          useTerminalStore.getState().cdToDir(query.trim());
        }
        break;
      case 'Delete':
        e.preventDefault();
        if (allDirs[selectedIndex]) {
          const item = allDirs[selectedIndex];
          if (item.isFav) useTerminalStore.getState().removeFavoriteDir(item.dir);
          else useTerminalStore.getState().removeRecentDir(item.dir);
        }
        break;
      case 'Escape':
        e.preventDefault();
        useTerminalStore.getState().toggleDirPicker();
        break;
      default:
        return;
    }
    e.stopPropagation();
  }, [query, allDirs, selectedIndex, selectDir]);

  const handleContextMenu = useCallback((e: React.MouseEvent, dir: string, isFav: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, dir, isFav });
  }, []);

  const handleAddFav = useCallback(() => {
    if (favValue.trim()) {
      useTerminalStore.getState().addFavoriteDir(favValue.trim());
      setFavValue('');
      setAddingFav(false);
    }
  }, [favValue]);

  // Extract last folder name for display
  const shortName = (dir: string) => {
    const parts = dir.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] || dir;
  };

  if (!show) return null;

  return (
    <div className={`dir-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="dir-panel-resize" onMouseDown={handleResizeStart} />
      <div className="dir-panel-header">
        <span>Directories</span>
        <button className="dir-panel-close" onClick={() => useTerminalStore.getState().toggleDirPicker()}>&#10005;</button>
      </div>

      <input
        ref={inputRef}
        className="dir-panel-search"
        type="text"
        placeholder="Search or type path..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
        onKeyDown={handleInputKeyDown}
      />

      <div className="dir-panel-list" ref={listRef}>
        {favoriteDirs.length > 0 && !query && (
          <div className="dir-panel-section">Favorites</div>
        )}
        {allDirs.map((item, index) => (
          <React.Fragment key={item.dir}>
            {!query && index === favoriteDirs.length && recentDirs.some((d) => !new Set(favoriteDirs).has(d)) && (
              <div className="dir-panel-section">Recent</div>
            )}
            <div
              className={`dir-panel-item${index === selectedIndex ? ' selected' : ''}`}
              onClick={() => selectDir(item.dir)}
              onMouseEnter={() => setSelectedIndex(index)}
              onContextMenu={(e) => handleContextMenu(e, item.dir, item.isFav)}
              title={item.dir}
            >
              <span
                className="dir-star"
                onClick={(e) => {
                  e.stopPropagation();
                  useTerminalStore.getState()[item.isFav ? 'removeFavoriteDir' : 'addFavoriteDir'](item.dir);
                }}
              >
                {item.isFav ? '\u2605' : '\u2606'}
              </span>
              <div className="dir-panel-item-text">
                <span className="dir-panel-name">{shortName(item.dir)}</span>
                <span className="dir-panel-path">{item.dir}</span>
              </div>
              <button
                className="dir-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.isFav) useTerminalStore.getState().removeFavoriteDir(item.dir);
                  else useTerminalStore.getState().removeRecentDir(item.dir);
                }}
                title="Remove"
              >
                &#10005;
              </button>
            </div>
          </React.Fragment>
        ))}
        {allDirs.length === 0 && !query && (
          <div className="dir-panel-empty">No directories saved</div>
        )}
        {allDirs.length === 0 && query && (
          <div className="dir-panel-empty">Enter to cd to "{query}"</div>
        )}
      </div>

      <div className="dir-panel-footer">
        <button className="dir-panel-action" onClick={() => {
          const s = useTerminalStore.getState();
          const t = s.focusedTerminalId ? s.terminals.get(s.focusedTerminalId) : null;
          if (t?.cwd) { s.addRecentDir(t.cwd); s.addFavoriteDir(t.cwd); }
        }}>
          + Save Current Dir
        </button>
        {addingFav ? (
          <div className="dir-add-row">
            <input ref={favInputRef} className="dir-panel-search" type="text" placeholder="Path..." value={favValue}
              onChange={(e) => setFavValue(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleAddFav(); if (e.key === 'Escape') setAddingFav(false); }} />
            <button className="dir-add-btn" onClick={handleAddFav}>Add</button>
          </div>
        ) : (
          <button className="dir-panel-action" onClick={() => setAddingFav(true)}>+ Add Path</button>
        )}
      </div>

      {ctxMenu && (
        <div ref={ctxRef} className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          <button className="context-menu-item" onClick={() => { selectDir(ctxMenu.dir); setCtxMenu(null); }}>
            cd here
          </button>
          <button className="context-menu-item" onClick={() => { window.terminalAPI.openPath(ctxMenu.dir); setCtxMenu(null); }}>
            Open in explorer
          </button>
          <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.dir); setCtxMenu(null); }}>
            Copy path
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => {
            const s = useTerminalStore.getState();
            if (ctxMenu.isFav) s.removeFavoriteDir(ctxMenu.dir); else s.addFavoriteDir(ctxMenu.dir);
            setCtxMenu(null);
          }}>
            {ctxMenu.isFav ? 'Unfavorite' : 'Favorite'}
          </button>
          <button className="context-menu-item danger" onClick={() => {
            const s = useTerminalStore.getState();
            if (ctxMenu.isFav) s.removeFavoriteDir(ctxMenu.dir); else s.removeRecentDir(ctxMenu.dir);
            setCtxMenu(null);
          }}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

export default DirPanel;
