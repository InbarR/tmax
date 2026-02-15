import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';

const DirPicker: React.FC = () => {
  const show = useTerminalStore((s) => s.showDirPicker);
  const favoriteDirs = useTerminalStore((s) => s.favoriteDirs);
  const recentDirs = useTerminalStore((s) => s.recentDirs);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addingFav, setAddingFav] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const favInputRef = useRef<HTMLInputElement>(null);
  const [favValue, setFavValue] = useState('');

  // Build combined list: favorites first, then recents
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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [show]);

  useEffect(() => {
    if (selectedIndex >= allDirs.length) {
      setSelectedIndex(Math.max(0, allDirs.length - 1));
    }
  }, [allDirs.length, selectedIndex]);

  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (addingFav) {
      requestAnimationFrame(() => favInputRef.current?.focus());
    }
  }, [addingFav]);

  const close = useCallback(() => {
    useTerminalStore.getState().toggleDirPicker();
  }, []);

  const selectDir = useCallback((dir: string) => {
    useTerminalStore.getState().cdToDir(dir);
    close();
  }, [close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
        if (query && allDirs.length === 0) {
          // If typed a path that's not in the list, cd to it directly
          useTerminalStore.getState().cdToDir(query);
          close();
        } else if (allDirs[selectedIndex]) {
          selectDir(allDirs[selectedIndex].dir);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
    e.stopPropagation();
  }, [allDirs, selectedIndex, query, selectDir, close]);

  const toggleFav = useCallback((dir: string, isFav: boolean) => {
    if (isFav) {
      useTerminalStore.getState().removeFavoriteDir(dir);
    } else {
      useTerminalStore.getState().addFavoriteDir(dir);
    }
  }, []);

  const handleAddFav = useCallback(() => {
    if (favValue.trim()) {
      useTerminalStore.getState().addFavoriteDir(favValue.trim());
      setFavValue('');
      setAddingFav(false);
    }
  }, [favValue]);

  if (!show) return null;

  return (
    <div className="palette-backdrop" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder="Search dirs or type a path..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {favoriteDirs.length > 0 && !query && (
            <div className="dir-section-label">Favorites</div>
          )}
          {allDirs.map((item, index) => (
            <React.Fragment key={item.dir}>
              {!query && index === favoriteDirs.length && recentDirs.some((d) => !new Set(favoriteDirs).has(d)) && (
                <div className="dir-section-label">Recent</div>
              )}
              <div
                className={`palette-item${index === selectedIndex ? ' selected' : ''}`}
                onClick={() => selectDir(item.dir)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="dir-star" onClick={(e) => { e.stopPropagation(); toggleFav(item.dir, item.isFav); }}>
                  {item.isFav ? '\u2605' : '\u2606'}
                </span>
                <span className="palette-label">{item.dir}</span>
              </div>
            </React.Fragment>
          ))}
          {allDirs.length === 0 && !query && (
            <div className="palette-empty">No favorite or recent directories</div>
          )}
          {allDirs.length === 0 && query && (
            <div className="palette-empty">Press Enter to cd to "{query}"</div>
          )}
        </div>
        <div className="dir-footer">
          <div className="dir-footer-buttons">
            <button className="dir-add-fav-btn" onClick={() => {
              // Save the focused terminal's cwd as recent + favorite
              const s = useTerminalStore.getState();
              const t = s.focusedTerminalId ? s.terminals.get(s.focusedTerminalId) : null;
              if (t?.cwd) {
                s.addRecentDir(t.cwd);
                s.addFavoriteDir(t.cwd);
              }
            }}>
              + Save Current Dir
            </button>
            {addingFav ? (
              <div className="dir-add-row">
                <input
                  ref={favInputRef}
                  className="settings-input"
                  type="text"
                  placeholder="Path to favorite..."
                  value={favValue}
                  onChange={(e) => setFavValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleAddFav();
                    if (e.key === 'Escape') setAddingFav(false);
                  }}
                />
                <button className="dir-add-btn" onClick={handleAddFav}>Add</button>
              </div>
            ) : (
              <button className="dir-add-fav-btn" onClick={() => setAddingFav(true)}>
                + Add Custom Path
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirPicker;
