import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';

const TerminalSwitcher: React.FC = () => {
  const show = useTerminalStore((s) => s.showSwitcher);
  const terminals = useTerminalStore((s) => s.terminals);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => Array.from(terminals.entries()), [terminals]);

  const filtered = useMemo(() => {
    if (!query) return entries;
    const q = query.toLowerCase();
    return entries.filter(([, t]) => t.title.toLowerCase().includes(q));
  }, [entries, query]);

  // Reset state when opening
  useEffect(() => {
    if (show) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [show]);

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const close = useCallback(() => {
    useTerminalStore.getState().toggleSwitcher();
  }, []);

  const selectTerminal = useCallback((id: string) => {
    useTerminalStore.getState().setFocus(id);
    close();
  }, [close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          selectTerminal(filtered[selectedIndex][0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
    e.stopPropagation();
  }, [filtered, selectedIndex, selectTerminal, close]);

  if (!show) return null;

  return (
    <div className="switcher-backdrop" onClick={close}>
      <div className="switcher" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="switcher-input"
          type="text"
          placeholder="Jump to terminal..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <div className="switcher-list">
          {filtered.map(([id, terminal], index) => (
            <div
              key={id}
              className={`switcher-item${index === selectedIndex ? ' selected' : ''}${id === focusedId ? ' current' : ''}`}
              onClick={() => selectTerminal(id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="switcher-title">{terminal.title}</span>
              <span className="switcher-mode">{terminal.mode}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="switcher-empty">No matching terminals</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalSwitcher;
