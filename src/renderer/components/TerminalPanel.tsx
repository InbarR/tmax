import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { useTerminalStore } from '../state/terminal-store';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  terminalId: string;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ terminalId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{ resultIndex: number; resultCount: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const config = useTerminalStore((s) => s.config);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const isFocused = focusedTerminalId === terminalId;

  const handleFocus = useCallback(() => {
    useTerminalStore.getState().setFocus(terminalId);
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const themeConfig = config?.theme;
    const termConfig = config?.terminal;

    const term = new Terminal({
      theme: themeConfig
        ? {
            background: themeConfig.background,
            foreground: themeConfig.foreground,
            cursor: themeConfig.cursor,
            selectionBackground: themeConfig.selectionBackground,
          }
        : {
            background: '#1e1e2e',
            foreground: '#cdd6f4',
            cursor: '#f5e0dc',
            selectionBackground: '#585b70',
          },
      fontSize: termConfig?.fontSize ?? 14,
      fontFamily: termConfig?.fontFamily ?? "'Cascadia Code', 'Consolas', monospace",
      scrollback: termConfig?.scrollback ?? 5000,
      cursorStyle: termConfig?.cursorStyle ?? 'block',
      cursorBlink: termConfig?.cursorBlink ?? true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    searchAddonRef.current = searchAddon;

    searchAddon.onDidChangeResults((e) => {
      if (e) {
        setSearchResult({ resultIndex: e.resultIndex, resultCount: e.resultCount });
      } else {
        setSearchResult(null);
      }
    });

    // Keyboard shortcuts handled inside terminal
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      // Ctrl+F: open search
      if (event.ctrlKey && !event.shiftKey && (event.key === 'f' || event.key === 'F')) {
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return false;
      }
      // Ctrl+V or Ctrl+Shift+V: paste
      if (event.ctrlKey && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault(); // Stop browser native paste (would cause double paste)
        const text = window.terminalAPI.clipboardRead();
        if (text) window.terminalAPI.writePty(terminalId, text);
        return false;
      }
      // Ctrl+C with selection: copy instead of SIGINT
      if (event.ctrlKey && !event.shiftKey && (event.key === 'c' || event.key === 'C') && term.hasSelection()) {
        window.terminalAPI.clipboardWrite(term.getSelection());
        term.clearSelection();
        return false;
      }
      // Ctrl+Shift+C: always copy selection
      if (event.ctrlKey && event.shiftKey && (event.key === 'c' || event.key === 'C')) {
        const sel = term.getSelection();
        if (sel) window.terminalAPI.clipboardWrite(sel);
        return false;
      }
      // Ctrl+Enter / Shift+Enter: send win32-input-mode key events
      // Format: CSI Vk;Sc;Uc;Kd;Cs;Rc _ (VK_RETURN=13, ScanCode=28)
      // ConPTY processes these when an app has enabled win32-input-mode
      if (event.key === 'Enter' && (event.ctrlKey || event.shiftKey) && !event.altKey) {
        const cs = (event.ctrlKey ? 8 : 0) | (event.shiftKey ? 16 : 0);
        const uc = event.ctrlKey ? 10 : 13;
        window.terminalAPI.writePty(terminalId, `\x1b[13;28;${uc};1;${cs};1_`);
        return false;
      }
      return true;
    });

    term.open(containerRef.current);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container may not be sized yet
      }
    });

    // Write data to PTY when user types
    const dataDisposable = term.onData((data) => {
      window.terminalAPI.writePty(terminalId, data);
    });

    // Receive data from PTY
    const unsubscribePtyData = window.terminalAPI.onPtyData(
      (id: string, data: string) => {
        if (id === terminalId) {
          term.write(data);
          // Parse cwd from PowerShell prompt "PS C:\path>" or cmd prompt "C:\path>"
          const psMatch = data.match(/PS ([A-Z]:\\[^>]*?)>/i);
          const cmdMatch = data.match(/^([A-Z]:\\[^>]*?)>/im);
          const dir = psMatch?.[1] || cmdMatch?.[1];
          if (dir) {
            const store = useTerminalStore.getState();
            const terminal = store.terminals.get(terminalId);
            if (terminal && terminal.cwd !== dir) {
              const newTerminals = new Map(store.terminals);
              newTerminals.set(terminalId, { ...terminal, cwd: dir });
              useTerminalStore.setState({ terminals: newTerminals });
            }
          }
        }
      }
    );

    // Handle PTY exit — auto-close after brief delay
    const unsubscribePtyExit = window.terminalAPI.onPtyExit(
      (id: string, _exitCode: number | undefined) => {
        if (id === terminalId) {
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
          setTimeout(() => {
            useTerminalStore.getState().closeTerminal(terminalId);
          }, 500);
        }
      }
    );

    // Send startup command if set (for layout restore)
    const termInstance = useTerminalStore.getState().terminals.get(terminalId);
    if (termInstance?.startupCommand) {
      setTimeout(() => {
        window.terminalAPI.writePty(terminalId, termInstance.startupCommand + '\r');
      }, 1500);
    }

    // Auto-rename tab when shell sends title via OSC sequence (skip custom titles)
    const titleDisposable = term.onTitleChange((rawTitle) => {
      const store = useTerminalStore.getState();
      const terminal = store.terminals.get(terminalId);

      // Track last process name and cwd
      if (terminal && rawTitle) {
        let processName = rawTitle;
        const sep = processName.includes('\\') ? '\\' : '/';
        processName = (processName.split(sep).pop() || processName).replace(/\.(exe|cmd|bat|com)$/i, '');
        const updates: Partial<typeof terminal> = { lastProcess: processName };
        // If the title looks like a path, update cwd and track in recents
        if (rawTitle.match(/^[A-Z]:\\/i) || rawTitle.startsWith('/')) {
          updates.cwd = rawTitle;
          store.addRecentDir(rawTitle);
        }
        const newTerminals = new Map(store.terminals);
        newTerminals.set(terminalId, { ...terminal, ...updates });
        useTerminalStore.setState({ terminals: newTerminals });
      }

      if (terminal && rawTitle && !terminal.customTitle) {
        // Extract short name: last path segment, strip .exe
        let name = rawTitle;
        // Handle Windows paths (C:\foo\bar.exe) and unix paths (/usr/bin/bash)
        const sep = name.includes('\\') ? '\\' : '/';
        const lastSeg = name.split(sep).pop() || name;
        // Strip common extensions
        name = lastSeg.replace(/\.(exe|cmd|bat|com)$/i, '');
        // If it's just a path like "C:\Users\foo", show last folder
        // If title contains " - " (e.g. "vim - file.txt"), keep it
        if (rawTitle.includes(' - ')) {
          name = rawTitle.split(' - ').pop()?.trim() || name;
        }
        store.renameTerminal(terminalId, name || rawTitle);
      }
    });

    // Focus tracking via textarea focus
    const textareaEl = containerRef.current.querySelector('textarea');
    if (textareaEl) {
      textareaEl.addEventListener('focus', handleFocus);
    }

    // ResizeObserver for fit
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        window.terminalAPI.resizePty(terminalId, cols, rows);
      } catch {
        // Ignore resize errors during teardown
      }
    });
    resizeObserver.observe(containerRef.current);

    // Ctrl+mouse wheel zoom
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const store = useTerminalStore.getState();
        if (e.deltaY < 0) {
          store.zoomIn();
        } else {
          store.zoomOut();
        }
      }
    };
    containerRef.current.addEventListener('wheel', handleWheel, { passive: false });

    // Right-click: copy if selection, paste if no selection
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (term.hasSelection()) {
        window.terminalAPI.clipboardWrite(term.getSelection());
        term.clearSelection();
      } else {
        const text = window.terminalAPI.clipboardRead();
        if (text) window.terminalAPI.writePty(terminalId, text);
      }
    };
    // Use capture phase to intercept before any other handler
    containerRef.current.addEventListener('contextmenu', handleContextMenu, true);

    const containerEl = containerRef.current;

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      unsubscribePtyData();
      unsubscribePtyExit();
      if (textareaEl) {
        textareaEl.removeEventListener('focus', handleFocus);
      }
      containerEl.removeEventListener('wheel', handleWheel);
      containerEl.removeEventListener('contextmenu', handleContextMenu, true);
      titleDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [terminalId, handleFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to fontSize changes from zoom
  useEffect(() => {
    try {
      if (terminalRef.current && fitAddonRef.current) {
        terminalRef.current.options.fontSize = fontSize;
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        window.terminalAPI.resizePty(terminalId, cols, rows);
      }
    } catch { /* terminal may be disposed */ }
  }, [fontSize, terminalId]);

  // Programmatic focus when this terminal becomes focused in the store
  useEffect(() => {
    try {
      if (isFocused && terminalRef.current) {
        terminalRef.current.focus();
      }
    } catch { /* terminal may be disposed */ }
  }, [isFocused]);

  // Apply tab color or default color as terminal background tint via CSS overlay
  const tabColor = useTerminalStore((s) => s.terminals.get(terminalId)?.tabColor);
  const defaultTabColor = useTerminalStore((s) => (s.config as any)?.defaultTabColor);
  const bgTint = tabColor || defaultTabColor;

  const handleSearch = useCallback((query: string, backward?: boolean) => {
    if (!searchAddonRef.current || !query) return;
    const opts = { decorations: { matchOverviewRuler: '#888', activeMatchColorOverviewRuler: '#fff', matchBackground: '#585b70', activeMatchBackground: '#89b4fa' } };
    if (backward) {
      searchAddonRef.current.findPrevious(query, opts);
    } else {
      searchAddonRef.current.findNext(query, opts);
    }
  }, []);

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResult(null);
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, []);

  const className = `terminal-panel${isFocused ? ' focused' : ''}`;

  return (
    <div className={className} onMouseDown={handleFocus}>
      {showSearch && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            className="terminal-search-input"
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                handleSearch(searchQuery, e.shiftKey);
              }
              if (e.key === 'Escape') {
                handleCloseSearch();
              }
            }}
          />
          {searchQuery && searchResult && (
            <span className="terminal-search-count">
              {searchResult.resultCount > 0
                ? `${searchResult.resultIndex + 1}/${searchResult.resultCount}`
                : 'No results'}
            </span>
          )}
          <button className="terminal-search-btn" onClick={() => handleSearch(searchQuery, true)} title="Previous">&#9650;</button>
          <button className="terminal-search-btn" onClick={() => handleSearch(searchQuery)} title="Next">&#9660;</button>
          <button className="terminal-search-btn" onClick={handleCloseSearch} title="Close">&#10005;</button>
        </div>
      )}
      <div ref={containerRef} className="xterm-container" />
      {bgTint && <div className="terminal-color-overlay" style={{ background: bgTint + '18' }} />}
    </div>
  );
};

export default TerminalPanel;
