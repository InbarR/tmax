import React, { useEffect, useRef, useCallback, useState, useReducer } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { useTerminalStore } from '../state/terminal-store';
import '@xterm/xterm/css/xterm.css';

function ago(ts: number): string {
  if (!ts) return 'never';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${s.toFixed(1)}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

interface DiagnosticsOverlayProps {
  terminalId: string;
  diagRef: React.RefObject<{ keystrokeCount: number; lastKeystrokeTime: number; outputEventCount: number; lastOutputTime: number; outputBytes: number; focusEventCount: number; lastFocusTime: number }>;
  mainDiag: { pid: number; writeCount: number; lastWriteTime: number; dataCount: number; lastDataTime: number; dataBytes: number } | null;
  logPath: string;
  onClose: () => void;
}

const DiagnosticsOverlay: React.FC<DiagnosticsOverlayProps> = ({ terminalId, diagRef, mainDiag, logPath, onClose }) => {
  const d = diagRef.current;
  const xtermEl = document.activeElement;
  const xtermFocused = xtermEl?.tagName === 'TEXTAREA' && xtermEl.closest('.xterm-helper-textarea') !== null ||
    xtermEl?.classList.contains('xterm-helper-textarea');
  const winFocused = document.hasFocus();

  return (
    <div className="terminal-diag-overlay" onMouseDown={(e) => e.stopPropagation()}>
      <div className="terminal-diag-header">
        <span>Diagnostics · {terminalId.slice(0, 8)}</span>
        <button className="terminal-diag-close" onClick={onClose}>✕</button>
      </div>
      <table className="terminal-diag-table">
        <tbody>
          <tr><td>window focused</td><td className={winFocused ? 'diag-ok' : 'diag-warn'}>{winFocused ? 'yes' : 'NO'}</td></tr>
          <tr><td>xterm focused</td><td className={xtermFocused ? 'diag-ok' : 'diag-warn'}>{xtermFocused ? 'yes' : 'NO'}</td></tr>
          <tr><td colSpan={2} className="diag-section">Renderer</td></tr>
          <tr><td>keystrokes → IPC</td><td>{d.keystrokeCount} · {ago(d.lastKeystrokeTime)}</td></tr>
          <tr><td>output events ← IPC</td><td>{d.outputEventCount} · {ago(d.lastOutputTime)}</td></tr>
          <tr><td>output bytes</td><td>{d.outputBytes.toLocaleString()}</td></tr>
          <tr><td>focus events</td><td>{d.focusEventCount} · {ago(d.lastFocusTime)}</td></tr>
          <tr><td colSpan={2} className="diag-section">Main process (PTY)</td></tr>
          {mainDiag ? <>
            <tr><td>PID</td><td>{mainDiag.pid}</td></tr>
            <tr><td>write calls → PTY</td><td>{mainDiag.writeCount} · {ago(mainDiag.lastWriteTime)}</td></tr>
            <tr><td>data events ← PTY</td><td>{mainDiag.dataCount} · {ago(mainDiag.lastDataTime)}</td></tr>
            <tr><td>data bytes</td><td>{mainDiag.dataBytes.toLocaleString()}</td></tr>
          </> : <tr><td colSpan={2} className="diag-warn">PTY not found (exited?)</td></tr>}
        </tbody>
      </table>
      {logPath && (
        <div className="terminal-diag-logpath">
          <span className="terminal-diag-logpath-label">log:</span>
          <span className="terminal-diag-logpath-value" title={logPath}>{logPath}</span>
          <button className="terminal-diag-copy-btn" onClick={() => window.terminalAPI.clipboardWrite(logPath)} title="Copy path">⧉</button>
        </div>
      )}
      <div className="terminal-diag-hint">Ctrl+Shift+` to close · refreshes every 500ms</div>
    </div>
  );
};

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
  const [showDiag, setShowDiag] = useState(false);
  const [, tickDiag] = useReducer((x: number) => x + 1, 0);
  const diagRef = useRef({ keystrokeCount: 0, lastKeystrokeTime: 0, outputEventCount: 0, lastOutputTime: 0, outputBytes: 0, focusEventCount: 0, lastFocusTime: 0 });
  const mainDiagRef = useRef<{ pid: number; writeCount: number; lastWriteTime: number; dataCount: number; lastDataTime: number; dataBytes: number } | null>(null);
  const logPathRef = useRef<string>('');

  const config = useTerminalStore((s) => s.config);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const fontSize = useTerminalStore((s) => s.fontSize);
  // Track overlay state to re-focus xterm when overlays close
  const anyOverlayOpen = useTerminalStore((s) =>
    s.showCommandPalette || s.showSettings || s.showSwitcher || s.showShortcuts || s.showCopilotPanel || s.showDirPicker
  );
  const aiResumeCommandRef = useRef<string>('');
  const aiSessionStartedRef = useRef(false);
  const isFocused = focusedTerminalId === terminalId;

  const handleFocus = useCallback(() => {
    const prevFocused = useTerminalStore.getState().focusedTerminalId;
    useTerminalStore.getState().setFocus(terminalId);
    diagRef.current.focusEventCount++;
    diagRef.current.lastFocusTime = Date.now();
    window.terminalAPI.diagLog('renderer:focus-gained', { terminalId });
    // Always re-focus xterm textarea — the store won't trigger a re-focus
    // if this panel is already the focused one (isFocused won't change)
    try {
      terminalRef.current?.focus();
    } catch { /* terminal may be disposed */ }
    // Ensure DEC focus reporting reaches the PTY even if xterm.js lost
    // its internal focus-reporting state (e.g. after a pane split/resize).
    // Without this, Copilot CLI stays in isFocused=false and drops input.
    if (prevFocused !== terminalId) {
      if (prevFocused) {
        window.terminalAPI.writePty(prevFocused, '\x1b[O');
        window.terminalAPI.diagLog('renderer:focus-inject-out', { terminalId: prevFocused });
      }
      window.terminalAPI.writePty(terminalId, '\x1b[I');
      window.terminalAPI.diagLog('renderer:focus-inject-in', { terminalId });
    }
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
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank');
    });
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
      // Ctrl+Shift+`: toggle diagnostics overlay
      if (event.ctrlKey && event.shiftKey && event.key === '`') {
        setShowDiag((v) => !v);
        return false;
      }
      // Ctrl+F: open search
      if (event.ctrlKey && !event.shiftKey && (event.key === 'f' || event.key === 'F')) {
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return false;
      }
      // Ctrl+V / Cmd+V or Ctrl+Shift+V: paste
      if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault(); // Stop browser native paste (would cause double paste)
        if (window.terminalAPI.clipboardHasImage()) {
          window.terminalAPI.clipboardSaveImage().then((filePath) => {
            window.terminalAPI.writePty(terminalId, filePath);
          });
        } else {
          const text = window.terminalAPI.clipboardRead();
          if (text) window.terminalAPI.writePty(terminalId, text);
        }
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
      // Ctrl+Arrow: send win32-input-mode key events so CMD and other shells
      // that don't understand VT sequences can handle word navigation (#19)
      // Format: CSI Vk;Sc;Uc;Kd;Cs;Rc _
      if (event.ctrlKey && !event.altKey) {
        const arrowMap: Record<string, [number, number]> = {
          'ArrowLeft': [37, 75], 'ArrowRight': [39, 77],
          'ArrowUp': [38, 72], 'ArrowDown': [40, 80],
        };
        const arrow = arrowMap[event.key];
        if (arrow) {
          const cs = 8 | (event.shiftKey ? 16 : 0); // LEFT_CTRL + optional SHIFT
          window.terminalAPI.writePty(terminalId, `\x1b[${arrow[0]};${arrow[1]};0;1;${cs};1_`);
          return false;
        }
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
      diagRef.current.keystrokeCount++;
      diagRef.current.lastKeystrokeTime = Date.now();
      window.terminalAPI.diagLog('renderer:keystroke', { terminalId, bytes: data.length });
      window.terminalAPI.writePty(terminalId, data);
    });

    // Receive data from PTY — batch writes via rAF to avoid saturating the
    // renderer event loop during output bursts (e.g. after system resume).
    let pendingData = '';
    let rafScheduled = false;
    const flushPendingData = () => {
      rafScheduled = false;
      if (pendingData) {
        term.write(pendingData);
        pendingData = '';
      }
    };
    const unsubscribePtyData = window.terminalAPI.onPtyData(
      (id: string, data: string) => {
        if (id === terminalId) {
          diagRef.current.outputEventCount++;
          diagRef.current.lastOutputTime = Date.now();
          diagRef.current.outputBytes += data.length;
          pendingData += data;
          if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushPendingData);
          }
          // ── CWD detection ──────────────────────────────────────────
          // 1. OSC 7 (standard): \x1b]7;file:///C:/path\x07
          // 2. OSC 9;9 (ConPTY/Windows Terminal): \x1b]9;9;C:\path\x07
          // 3. Prompt regex fallback: "PS C:\path>" or "C:\path>"
          let detectedDir: string | null = null;

          // Try OSC 7 (file URI)
          const osc7Match = data.match(/\x1b\]7;file:\/\/[^/]*\/([^\x07\x1b]+)(?:\x07|\x1b\\)/);
          if (osc7Match) {
            detectedDir = decodeURIComponent(osc7Match[1]).replace(/\//g, '\\');
          }

          // Try OSC 9;9 (Windows Terminal / ConPTY)
          if (!detectedDir) {
            const osc9Match = data.match(/\x1b\]9;9;([^\x07\x1b]+)(?:\x07|\x1b\\)/);
            if (osc9Match) {
              detectedDir = osc9Match[1];
            }
          }

          // Fallback: parse prompt text for standard PS/cmd prompts
          if (!detectedDir) {
            const clean = data
              .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // OSC sequences
              .replace(/\x1b\[[?]?[0-9;]*[A-Za-z]/g, '')            // CSI sequences (including ?25h/l)
              .replace(/\x1b[^[\]].?/g, '');                         // Other short escapes
            const psMatch = clean.match(/PS ([A-Z]:\\[^>]*?)>\s*$/im);
            const cmdMatch = clean.match(/^([A-Z]:\\[^>]*?)>\s*$/im);
            detectedDir = psMatch?.[1] || cmdMatch?.[1] || null;
          }

          if (detectedDir) {
            const store = useTerminalStore.getState();
            const terminal = store.terminals.get(terminalId);
            if (terminal && terminal.cwd !== detectedDir) {
              const newTerminals = new Map(store.terminals);
              newTerminals.set(terminalId, { ...terminal, cwd: detectedDir });
              useTerminalStore.setState({ terminals: newTerminals });
              store.addRecentDir(detectedDir);
            }
            // Shell prompt appeared after AI session exited — pre-fill resume command
            if (aiSessionStartedRef.current && aiResumeCommandRef.current) {
              aiSessionStartedRef.current = false;
              const resumeCmd = aiResumeCommandRef.current;
              setTimeout(() => {
                window.terminalAPI.writePty(terminalId, resumeCmd);
              }, 200);
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
    if (termInstance?.startupCommand && !termInstance.startupCommandSent) {
      const cmd = termInstance.startupCommand;
      // Save resume command for AI sessions so we can pre-fill it on exit
      if (termInstance.aiSessionId) {
        aiResumeCommandRef.current = cmd;
      }
      setTimeout(() => {
        window.terminalAPI.writePty(terminalId, cmd + '\r');
        if (termInstance.aiSessionId) {
          aiSessionStartedRef.current = true;
        }
      }, 1500);
      // Mark as sent so it doesn't re-run on hot reload, but keep the value for session save
      const store = useTerminalStore.getState();
      const newTerminals = new Map(store.terminals);
      const t = newTerminals.get(terminalId);
      if (t) {
        newTerminals.set(terminalId, { ...t, startupCommandSent: true });
        useTerminalStore.setState({ terminals: newTerminals });
      }
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
        // If the title looks like a directory path, update cwd and track in recents
        // Strip ANSI escape sequences and only accept clean paths
        const trimmed = rawTitle.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
        const looksLikePath = /^[A-Z]:\\/i.test(trimmed) || trimmed.startsWith('/');
        const hasFileExtension = /\.\w{1,5}$/i.test(trimmed);
        if (looksLikePath && !hasFileExtension) {
          updates.cwd = trimmed;
          store.addRecentDir(trimmed);
        }
        const newTerminals = new Map(store.terminals);
        newTerminals.set(terminalId, { ...terminal, ...updates });
        useTerminalStore.setState({ terminals: newTerminals });
      }

      if (terminal && rawTitle && !terminal.customTitle && store.renamingTerminalId !== terminalId) {
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

    // Focus tracking via textarea focus/blur
    const textareaEl = containerRef.current.querySelector('textarea');
    const handleBlur = () => {
      window.terminalAPI.diagLog('renderer:focus-lost', { terminalId });
      // Re-focus if this terminal is still the active one AND nothing else explicitly took
      // focus. Check document.activeElement instead of overlay visibility flags — a panel
      // being visible (e.g. Copilot sidebar) doesn't mean it holds keyboard focus.
      requestAnimationFrame(() => {
        if (useTerminalStore.getState().focusedTerminalId !== terminalId) return;
        const active = document.activeElement;
        const somethingElseTookFocus = active && active !== document.body && !containerRef.current?.contains(active);
        if (!somethingElseTookFocus) {
          try { terminalRef.current?.focus(); } catch { /* disposed */ }
        }
      });
    };
    if (textareaEl) {
      textareaEl.addEventListener('focus', handleFocus);
      textareaEl.addEventListener('blur', handleBlur);
    }

    // ResizeObserver for fit — debounced to avoid rapid resize races
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          const { cols, rows } = term;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        } catch {
          // Ignore resize errors during teardown
        }
      }, 100);
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
        if (window.terminalAPI.clipboardHasImage()) {
          window.terminalAPI.clipboardSaveImage().then((filePath) => {
            window.terminalAPI.writePty(terminalId, filePath);
          });
        } else {
          const text = window.terminalAPI.clipboardRead();
          if (text) window.terminalAPI.writePty(terminalId, text);
        }
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
        textareaEl.removeEventListener('blur', handleBlur);
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

  // Programmatic focus when this terminal becomes focused in the store,
  // or when overlays close (to restore DEC focus reporting for Copilot CLI)
  useEffect(() => {
    try {
      if (isFocused && !anyOverlayOpen && terminalRef.current) {
        terminalRef.current.focus();
      }
    } catch { /* terminal may be disposed */ }
  }, [isFocused, anyOverlayOpen]);

  // Re-focus xterm when the OS window regains focus (alt-tab back)
  useEffect(() => {
    if (!isFocused) return;
    const handleWindowFocus = () => {
      try {
        if (terminalRef.current) {
          terminalRef.current.focus();
        }
      } catch { /* terminal may be disposed */ }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [isFocused]);

  // Re-fit terminals and re-focus when returning from sleep/lock/idle
  // This wakes up stalled ConPTY processes via the resize signal
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      try {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        }
        if (isFocused && terminalRef.current) {
          terminalRef.current.focus();
        }
      } catch { /* terminal may be disposed */ }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isFocused, terminalId]);

  // Poll main-process PTY stats when diagnostics overlay is open
  useEffect(() => {
    if (!showDiag) return;
    if (!logPathRef.current) {
      window.terminalAPI.getDiagLogPath().then((p) => { logPathRef.current = p; });
    }
    const refresh = () => {
      window.terminalAPI.getPtyDiag(terminalId).then((stats) => {
        mainDiagRef.current = stats;
        tickDiag();
      });
    };
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [showDiag, terminalId]);

  // Apply tab color or default color as terminal background tint via CSS overlay
  const title = useTerminalStore((s) => s.terminals.get(terminalId)?.title);
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
    <div
      className={className}
      onMouseDownCapture={(e) => {
        if (!isFocused) {
          // This click is a pane-switch click, not a TUI interaction.
          // Stop it before xterm sees it so it isn't forwarded to the PTY as a
          // mouse event (which causes mouse-reporting apps like Claude CLI to
          // shift their internal focus away from the input field).
          e.stopPropagation();
          window.terminalAPI.diagLog('renderer:pane-switch-click-suppressed', { terminalId });
        }
        handleFocus();
      }}
    >
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
      {title && <div className="terminal-pane-title">{title}</div>}
      {showDiag && <DiagnosticsOverlay terminalId={terminalId} diagRef={diagRef} mainDiag={mainDiagRef.current} logPath={logPathRef.current} onClose={() => setShowDiag(false)} />}
      <div ref={containerRef} className="xterm-container" />
      <button
        className="terminal-diff-btn"
        title="Open diff review"
        onMouseDown={(e) => {
          e.stopPropagation();
          useTerminalStore.getState().openDiffReview(terminalId);
        }}
      >&#9998;</button>
      <button
        className="terminal-refocus-btn"
        title="Re-focus terminal (use if stuck)"
        onMouseDown={(e) => {
          e.stopPropagation();
          try {
            if (fitAddonRef.current) fitAddonRef.current.fit();
            if (terminalRef.current) {
              const { cols, rows } = terminalRef.current;
              window.terminalAPI.resizePty(terminalId, cols, rows);
              terminalRef.current.focus();
            }
          } catch { /* terminal may be disposed */ }
        }}
      >&#8635;</button>
      {bgTint && <div className="terminal-color-overlay" style={{ background: bgTint + '18' }} />}
    </div>
  );
};

export default TerminalPanel;
