import React, { useEffect, useRef, useCallback, useState, useReducer } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { useTerminalStore } from '../state/terminal-store';
import { registerTerminal, unregisterTerminal, getTerminalEntry, addTerminalCleanup, stashTerminal, unstashTerminal, disposeTerminal, setWebglAddon, setTextareaHandlers, removeTextareaHandlers } from '../terminal-registry';
import { isMac } from '../utils/platform';
import type { AppConfig } from '../state/types';
import '@xterm/xterm/css/xterm.css';

/**
 * Extract a URL from HTML clipboard content when the content is essentially
 * a single hyperlink (e.g. ADO "Copy to clipboard" for PR titles).
 * Returns the href if found, null otherwise.
 */
function extractLinkFromHtml(html: string): string | null {
  if (!html) return null;
  // Match all <a href="..."> tags in the HTML
  const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(html)) !== null) {
    matches.push(m[1]);
  }
  // Only extract when the HTML contains exactly one link
  if (matches.length === 1) return matches[0];
  return null;
}

function hexToTerminalRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/**
 * Force xterm's viewport to sync its native scroll area with the buffer.
 * Without this, the native scrollbar may show no thumb even though there
 * is scrollback content (wheel scrolling still works because xterm handles
 * it in JS, but the scrollbar indicator is absent).
 */
function syncViewportScrollArea(term: Terminal): void {
  try {
    (term as any)._core?.viewport?.syncScrollArea();
  } catch { /* viewport may not be ready */ }
}

const WSL_PROMPT_DEBOUNCE_MS = 200;
const WSL_PROMPT_FALLBACK_MS = 5000;

/**
 * Sends a command to a WSL terminal after detecting the shell prompt.
 * Uses debounce to avoid firing on MOTD/banner text, with a fallback timeout.
 * Returns a cleanup function for useEffect teardown.
 */
function sendCommandOnWslPrompt(
  terminalId: string,
  cmd: string,
  onSent?: (cmd: string) => void,
): () => void {
  let promptSent = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const checkPrompt = (id: string, data: string) => {
    if (id !== terminalId || promptSent) return;
    const clean = data.replace(/\x1b\[[^m]*m/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
    // $/#/% = sh/bash/zsh; ❯/➜ = Oh-My-Zsh/Starship; > = fish/generic
    if (/[$#%❯➜>]\s*$/.test(clean)) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!promptSent) {
          promptSent = true;
          promptUnsub();
          window.terminalAPI.writePty(terminalId, cmd + '\r');
          onSent?.(cmd);
        }
      }, WSL_PROMPT_DEBOUNCE_MS);
    }
  };

  const promptUnsub = window.terminalAPI.onPtyData(checkPrompt);

  const fallbackTimer = setTimeout(() => {
    if (!promptSent) {
      promptSent = true;
      promptUnsub();
      if (debounceTimer) clearTimeout(debounceTimer);
      window.terminalAPI.writePty(terminalId, cmd + '\r');
      onSent?.(cmd);
    }
  }, WSL_PROMPT_FALLBACK_MS);

  return () => {
    promptUnsub();
    clearTimeout(fallbackTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

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
  const [processStatus, setProcessStatus] = useState<'active' | 'idle' | 'exited-ok' | 'exited-error'>('idle');
  const processStatusRef = useRef(processStatus);
  const [showDiag, setShowDiag] = useState(false);
  const [isRenamingPane, setIsRenamingPane] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [, tickDiag] = useReducer((x: number) => x + 1, 0);
  const diagRef = useRef({ keystrokeCount: 0, lastKeystrokeTime: 0, outputEventCount: 0, lastOutputTime: 0, outputBytes: 0, focusEventCount: 0, lastFocusTime: 0 });
  const mainDiagRef = useRef<{ pid: number; writeCount: number; lastWriteTime: number; dataCount: number; lastDataTime: number; dataBytes: number } | null>(null);
  const logPathRef = useRef<string>('');

  const config = useTerminalStore((s) => s.config);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const fontSize = useTerminalStore((s) => s.fontSize);
  // Track modal overlay state — sidebars (copilot, dirs, explorer) should NOT block terminal focus
  const anyOverlayOpen = useTerminalStore((s) =>
    s.showCommandPalette || s.showSettings || s.showSwitcher || s.showShortcuts
  );
  const aiResumeCommandRef = useRef<string>('');
  const aiSessionStartedRef = useRef(false);
  const wslPromptCleanupRef = useRef<(() => void) | null>(null);
  const isFocused = focusedTerminalId === terminalId;

  const handleFocus = useCallback(() => {
    const prevFocused = useTerminalStore.getState().focusedTerminalId;
    useTerminalStore.getState().setFocus(terminalId);
    diagRef.current.focusEventCount++;
    diagRef.current.lastFocusTime = Date.now();
    window.terminalAPI.diagLog('renderer:focus-gained', { terminalId });
    // Re-focus xterm textarea — the store won't trigger a re-focus
    // if this panel is already the focused one (isFocused won't change).
    // Skip when textarea already has DOM focus: a redundant term.focus()
    // in the same frame corrupts xterm's cursor-blink state and paints a
    // stale cursor (#41).
    try {
      const textarea = containerRef.current?.querySelector('textarea');
      if (!textarea || document.activeElement !== textarea) {
        terminalRef.current?.focus();
      }
    } catch { /* terminal may be disposed */ }
    // Ensure DEC focus reporting reaches the PTY even if xterm.js lost
    // its internal focus-reporting state (e.g. after a pane split/resize).
    // Without this, Copilot CLI stays in isFocused=false and drops input.
    // Only inject when actually switching between two terminals — not on
    // first focus (prevFocused=null) to avoid stray sequences.
    // Guard: skip the manual injection when xterm's textarea already has
    // DOM focus — in that case xterm.js sends the DEC sequence natively
    // and a second one causes duplicate cursors (#41).
    if (prevFocused && prevFocused !== terminalId) {
      window.terminalAPI.writePty(prevFocused, '\x1b[O');
      window.terminalAPI.diagLog('renderer:focus-inject-out', { terminalId: prevFocused });
      const textarea = containerRef.current?.querySelector('textarea');
      if (!textarea || document.activeElement !== textarea) {
        requestAnimationFrame(() => {
          window.terminalAPI.writePty(terminalId, '\x1b[I');
          window.terminalAPI.diagLog('renderer:focus-inject-in', { terminalId });
        });
      }
    }
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── REATTACH PATH ──────────────────────────────────────────────
    // If this terminal was stashed (layout restructured, not closed),
    // reattach the existing xterm DOM instead of creating a new instance.
    const stashedEntry = getTerminalEntry(terminalId);
    if (stashedEntry?.stashed) {
      unstashTerminal(terminalId, containerRef.current);
      const { terminal: term, fitAddon, searchAddon } = stashedEntry;
      terminalRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // Re-add textarea focus/blur handlers with fresh refs.
      // The old handlers (from the previous mount) had stale containerRef values;
      // removing them in the stash cleanup prevents focus fights.
      const textareaEl = containerRef.current.querySelector('textarea');
      if (textareaEl) {
        const handleBlur = () => {
          requestAnimationFrame(() => {
            if (useTerminalStore.getState().focusedTerminalId !== terminalId) return;
            const active = document.activeElement;
            const somethingElseTookFocus = active && active !== document.body && !containerRef.current?.contains(active);
            if (!somethingElseTookFocus) {
              try { terminalRef.current?.focus(); } catch { /* disposed */ }
            }
          });
        };
        setTextareaHandlers(terminalId, { textarea: textareaEl as HTMLTextAreaElement, focus: handleFocus, blur: handleBlur });
      }

      // Re-fit after DOM settles and auto-focus if this is the focused terminal.
      const focusTimers: ReturnType<typeof setTimeout>[] = [];
      const focusIfNeeded = () => {
        try {
          const shouldFocus = useTerminalStore.getState().focusedTerminalId === terminalId;
          if (shouldFocus) {
            term.focus();
            const ta = containerRef.current?.querySelector('textarea');
            if (ta && document.activeElement !== ta) {
              (ta as HTMLElement).focus();
            }
          }
        } catch { /* terminal may be disposed */ }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            fitAddon.fit();
            const { cols, rows } = term;
            window.terminalAPI.resizePty(terminalId, cols, rows);
          } catch { /* container may not be sized yet */ }
          focusIfNeeded();
        });
      });
      focusTimers.push(setTimeout(focusIfNeeded, 80));
      focusTimers.push(setTimeout(focusIfNeeded, 200));

      // Re-create WebGL renderer (disposed during stash to avoid stale GL context)
      if (!term.options.allowTransparency) {
        import('@xterm/addon-webgl').then(({ WebglAddon }) => {
          if (!terminalRef.current || terminalRef.current !== term) return;
          try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => {
              try { webgl.dispose(); } catch { /* ignore */ }
              setWebglAddon(terminalId, null);
            });
            term.loadAddon(webgl);
            setWebglAddon(terminalId, webgl);
          } catch { /* WebGL not available — canvas fallback */ }
        }).catch(() => { /* import failed */ });
      }

      // Re-subscribe to PTY IPC events (previous listeners were removed on unmount)
      const unsubPtyData = window.terminalAPI.onPtyData((id: string, data: string) => {
        if (id === terminalId) term.write(data);
      });
      const unsubPtyExit = window.terminalAPI.onPtyExit((id: string, exitCode: number | undefined) => {
        if (id === terminalId) {
          window.terminalAPI.diagLog('renderer:pty-exit-received', { terminalId, exitCode });
          setProcessStatus(exitCode && exitCode !== 0 ? 'exited-error' : 'exited-ok');
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
          setTimeout(() => {
            useTerminalStore.getState().closeTerminal(terminalId);
          }, 500);
        }
      });

      // ResizeObserver for the new container
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            fitAddon.fit();
            const { cols, rows } = term;
            window.terminalAPI.resizePty(terminalId, cols, rows);
          } catch { /* ignore */ }
        }, 30);
      });
      resizeObserver.observe(containerRef.current);

      // Container-specific event listeners
      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const store = useTerminalStore.getState();
          if (e.deltaY < 0) store.zoomIn(); else store.zoomOut();
        }
      };
      containerRef.current.addEventListener('wheel', handleWheel, { passive: false });

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
      containerRef.current.addEventListener('contextmenu', handleContextMenu, true);

      const containerEl = containerRef.current;

      return () => {
        // Cancel pending focus timers to prevent stale focus calls
        for (const t of focusTimers) clearTimeout(t);
        unsubPtyData();
        unsubPtyExit();
        resizeObserver.disconnect();
        if (resizeTimer) clearTimeout(resizeTimer);
        containerEl.removeEventListener('wheel', handleWheel);
        containerEl.removeEventListener('contextmenu', handleContextMenu, true);

        // Remove textarea handlers BEFORE stashing to prevent stale listeners
        // from firing focus events with dead refs after unmount
        removeTextareaHandlers(terminalId);

        if (useTerminalStore.getState().terminals.has(terminalId)) {
          // Layout restructure — stash again for next reattach
          stashTerminal(terminalId);
        } else {
          // Terminal actually closed — full dispose handled by closeTerminal
          terminalRef.current = null;
          fitAddonRef.current = null;
          searchAddonRef.current = null;
        }
      };
    }

    // ── FRESH CREATION PATH ────────────────────────────────────────
    const themeConfig = config?.theme;
    const termConfig = config?.terminal;

    const rawBg = themeConfig?.background ?? '#1e1e2e';
    const materialActive = (config as AppConfig)?.backgroundMaterial && (config as AppConfig).backgroundMaterial !== 'none';
    const bgOpacity = materialActive ? ((config as AppConfig)?.backgroundOpacity ?? 0.8) : 1;
    const bgColor = bgOpacity < 1 ? hexToTerminalRgba(rawBg, bgOpacity) : rawBg;
    const term = new Terminal({
      theme: themeConfig
        ? {
            background: bgColor,
            foreground: themeConfig.foreground,
            cursor: themeConfig.cursor,
            selectionBackground: themeConfig.selectionBackground,
          }
        : {
            background: bgColor,
            foreground: '#cdd6f4',
            cursor: '#f5e0dc',
            selectionBackground: '#585b70',
          },
      fontSize: termConfig?.fontSize ?? 14,
      fontFamily: termConfig?.fontFamily ?? "'Cascadia Code', 'Consolas', monospace",
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: 0,
      scrollback: termConfig?.scrollback ?? 5000,
      cursorStyle: termConfig?.cursorStyle ?? 'block',
      cursorBlink: termConfig?.cursorBlink ?? true,
      cursorInactiveStyle: 'none',
      allowTransparency: bgOpacity < 1,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    // Custom URL regex: xterm.js default excludes | (pipe) from URLs, but many
    // dev tools emit URLs containing pipes (e.g. query params with | delimiters).
    const urlRegex = /(https?|HTTPS?):[/]{2}[^\s"'!*(){}\\\^<>`]*[^\s"':,.!?{}\\\^~\[\]`()<>]/;
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank');
    }, { urlRegex });
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    searchAddonRef.current = searchAddon;
    registerTerminal(terminalId, term, searchAddon, fitAddon);

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
      // Ctrl+Shift+` (Cmd+Shift+` on Mac): toggle diagnostics overlay
      if ((isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && event.key === '`') {
        setShowDiag((v) => !v);
        return false;
      }
      // Ctrl+F (Cmd+F on Mac): open search
      if ((isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && (event.key === 'f' || event.key === 'F')) {
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
          const html = window.terminalAPI.clipboardReadHTML();
          const linkUrl = extractLinkFromHtml(html);
          const text = linkUrl || window.terminalAPI.clipboardRead();
          if (text) window.terminalAPI.writePty(terminalId, text);
        }
        return false;
      }
      // Ctrl+C with selection: copy instead of SIGINT (Cmd+C on Mac)
      if ((isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && (event.key === 'c' || event.key === 'C') && term.hasSelection()) {
        window.terminalAPI.clipboardWrite(term.getSelection());
        term.clearSelection();
        return false;
      }
      // Ctrl+Shift+C (Cmd+Shift+C on Mac): always copy selection
      if ((isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && (event.key === 'c' || event.key === 'C')) {
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
      // Log every Enter press so we can diagnose "sometimes works" intermittency
      if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        window.terminalAPI.diagLog('renderer:enter-keydown', {
          terminalId,
          key: event.key,
          code: event.code,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
          repeat: event.repeat,
        });
      }
      // Ctrl+Enter / Shift+Enter: match what Windows Terminal sends - full
      // win32-input-mode sequence where Uc is the character the key *would*
      // produce (always CR=13 for Enter, regardless of modifiers), and Cs
      // carries the modifier bits. Apps like Claude Code and Copilot CLI use
      // the Cs field to distinguish Shift+Enter (insert newline) from Enter
      // (submit). The earlier `Uc=10` variant for Shift+Enter confused apps.
      // Format: CSI Vk;Sc;Uc;Kd;Cs;Rc _ (VK_RETURN=13, ScanCode=28, Kd=down)
      // Use event.code so NumpadEnter is also caught (event.key is still 'Enter' but
      // different layouts/IMEs can change event.key).
      const isEnterKey = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
      if (isEnterKey && (event.ctrlKey || event.shiftKey) && !event.altKey) {
        // AI sessions (Copilot CLI, Claude Code): send ESC+CR (\x1b\r), the
        // same sequence Option+Enter produces natively. CLI line-editors
        // (e.g. readline, rustyline) interpret this as "insert newline".
        const termInstance = useTerminalStore.getState().terminals.get(terminalId);
        if (termInstance?.aiSessionId) {
          window.terminalAPI.writePty(terminalId, '\x1b\r');
          window.terminalAPI.diagLog('renderer:enter-sent', { terminalId, path: 'ai-newline' });
          return false;
        }
        const modBits = 1 + (event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0) + (event.ctrlKey ? 4 : 0);
        window.terminalAPI.writePty(terminalId, `\x1b[13;${modBits}u`);
        window.terminalAPI.diagLog('renderer:enter-sent', { terminalId, path: 'csi-u', mod: modBits });
        return false;
      }
      return true;
    });

    term.open(containerRef.current);

    // Load WebGL renderer for GPU-accelerated rendering (5-10x faster).
    // WebGL doesn't support allowTransparency — fall back to canvas in that case.
    if (!term.options.allowTransparency) {
      import('@xterm/addon-webgl').then(({ WebglAddon }) => {
        // Guard: terminal may have been disposed by the time import resolves
        if (!terminalRef.current || terminalRef.current !== term) return;
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            try { webgl.dispose(); } catch { /* ignore */ }
            setWebglAddon(terminalId, null);
          });
          term.loadAddon(webgl);
          setWebglAddon(terminalId, webgl);
        } catch {
          // WebGL not available — canvas fallback is automatic
        }
      }).catch(() => { /* import failed — canvas fallback */ });
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        syncViewportScrollArea(term);
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
          // Only mark as active for substantial output (>50 bytes), not cursor/prompt redraws
          if (data.length > 50 && processStatusRef.current !== 'active') {
            processStatusRef.current = 'active';
            setProcessStatus('active');
          }
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

          // Check if this is a WSL terminal (preserve Linux-style paths)
          const termInst = useTerminalStore.getState().terminals.get(terminalId);
          const isWsl = termInst?.wsl === true;

          // Try OSC 7 (file URI)
          const osc7Match = data.match(/\x1b\]7;file:\/\/[^/]*\/([^\x07\x1b]+)(?:\x07|\x1b\\)/);
          if (osc7Match) {
            const decoded = decodeURIComponent(osc7Match[1]);
            // For WSL terminals, keep Linux-style forward slashes; prefix with / for absolute path
            detectedDir = isWsl ? '/' + decoded : decoded.replace(/\//g, '\\');
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
              // For WSL terminals, translate Linux path to UNC for the Dirs panel
              if (terminal.wslDistro && detectedDir.startsWith('/')) {
                store.addRecentDir(`\\\\wsl.localhost\\${terminal.wslDistro}${detectedDir.replace(/\//g, '\\')}`);
              } else {
                store.addRecentDir(detectedDir);
              }
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
      (id: string, exitCode: number | undefined) => {
        if (id === terminalId) {
          window.terminalAPI.diagLog('renderer:pty-exit-received', { terminalId, exitCode });
          setProcessStatus(exitCode && exitCode !== 0 ? 'exited-error' : 'exited-ok');
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
          setTimeout(() => {
            window.terminalAPI.diagLog('renderer:close-terminal-start', { terminalId });
            useTerminalStore.getState().closeTerminal(terminalId);
          }, 500);
        }
      }
    );

    // Send startup command if set (for layout restore)
    const termInstance = useTerminalStore.getState().terminals.get(terminalId);
    if (termInstance?.startupCommand && !termInstance.startupCommandSent) {
      const cmd = termInstance.startupCommand;
      if (termInstance.wsl) {
        // WSL: wait for the shell prompt before sending the command
        wslPromptCleanupRef.current = sendCommandOnWslPrompt(terminalId, cmd, (sentCmd) => {
          if (termInstance.aiSessionId) {
            aiResumeCommandRef.current = sentCmd;
            aiSessionStartedRef.current = true;
          }
        });
      } else {
        setTimeout(() => {
          window.terminalAPI.writePty(terminalId, cmd + '\r');
          // Arm the re-send mechanism for native AI sessions only.
          if (termInstance.aiSessionId) {
            aiResumeCommandRef.current = cmd;
            aiSessionStartedRef.current = true;
          }
        }, 1500);
      }
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
          if (terminal.wslDistro && trimmed.startsWith('/')) {
            store.addRecentDir(`\\\\wsl.localhost\\${terminal.wslDistro}${trimmed.replace(/\//g, '\\')}`);
          } else {
            store.addRecentDir(trimmed);
          }
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

    // Focus tracking via textarea focus/blur — managed through the registry
    // so handlers are properly removed on stash and re-added on unstash.
    const textareaEl = containerRef.current.querySelector('textarea');
    const handleBlur = () => {
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
      setTextareaHandlers(terminalId, { textarea: textareaEl as HTMLTextAreaElement, focus: handleFocus, blur: handleBlur });
    }

    // ResizeObserver for fit — debounced to avoid rapid resize races
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          syncViewportScrollArea(term);
          const { cols, rows } = term;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        } catch {
          // Ignore resize errors during teardown
        }
      }, 30);
    });
    resizeObserver.observe(containerRef.current);

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
          const html = window.terminalAPI.clipboardReadHTML();
          const linkUrl = extractLinkFromHtml(html);
          const text = linkUrl || window.terminalAPI.clipboardRead();
          if (text) window.terminalAPI.writePty(terminalId, text);
        }
      }
    };
    // Use capture phase to intercept before any other handler
    containerRef.current.addEventListener('contextmenu', handleContextMenu, true);

    const containerEl = containerRef.current;

    // Store terminal-level cleanups in the registry so they survive
    // across React unmount/remount cycles and run on actual close.
    addTerminalCleanup(terminalId, () => dataDisposable.dispose());
    addTerminalCleanup(terminalId, () => wslPromptCleanupRef.current?.());
    addTerminalCleanup(terminalId, () => titleDisposable.dispose());

    return () => {
      // Always unsubscribe PTY IPC listeners on unmount to prevent
      // listener accumulation across HMR / layout-induced remounts.
      unsubscribePtyData();
      unsubscribePtyExit();
      wslPromptCleanupRef.current?.();
      if (textareaEl) {
        textareaEl.removeEventListener('focus', handleFocus);
        textareaEl.removeEventListener('blur', handleBlur);
      }
      containerEl.removeEventListener('contextmenu', handleContextMenu, true);

      // Remove textarea handlers BEFORE stashing to prevent stale listeners
      removeTextareaHandlers(terminalId);

      if (useTerminalStore.getState().terminals.has(terminalId)) {
        // Layout restructure — stash xterm for reattachment on remount
        stashTerminal(terminalId);
      } else {
        // Terminal actually closed — full dispose handled by closeTerminal
        terminalRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
      }
    };
  }, [terminalId, handleFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to fontSize and fontFamily changes
  const configFontFamily = config?.terminal?.fontFamily;
  useEffect(() => {
    try {
      if (terminalRef.current && fitAddonRef.current) {
        terminalRef.current.options.fontSize = fontSize;
        if (configFontFamily) {
          terminalRef.current.options.fontFamily = configFontFamily;
        }
        fitAddonRef.current.fit();
        syncViewportScrollArea(terminalRef.current);
        const { cols, rows } = terminalRef.current;
        window.terminalAPI.resizePty(terminalId, cols, rows);
      }
    } catch { /* terminal may be disposed */ }
  }, [fontSize, configFontFamily, terminalId]);

  // Keep ref in sync for use in closure
  useEffect(() => { processStatusRef.current = processStatus; }, [processStatus]);

  // Process status: detect idle after 3s of no substantial output
  useEffect(() => {
    let lastBytes = 0;
    const id = setInterval(() => {
      setProcessStatus((prev) => {
        if (prev.startsWith('exited')) return prev;
        const now = Date.now();
        const elapsed = now - diagRef.current.lastOutputTime;
        const bytesDelta = diagRef.current.outputBytes - lastBytes;
        lastBytes = diagRef.current.outputBytes;
        // Active only if recent output AND substantial volume
        if (elapsed < 3000 && bytesDelta > 50) return 'active';
        return 'idle';
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Refit all terminals when view mode changes (focus↔grid↔split).
  // The ResizeObserver may fire before the DOM has fully settled, leaving
  // xterm's viewport scrollbar stale. A delayed refit fixes this.
  const viewMode = useTerminalStore((s) => s.viewMode);
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          syncViewportScrollArea(terminalRef.current);
          const { cols, rows } = terminalRef.current;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        }
      } catch { /* terminal may be disposed */ }
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, terminalId]);

  // Programmatic focus when this terminal becomes focused in the store,
  // or when overlays close (to restore DEC focus reporting for Copilot CLI)
  useEffect(() => {
    try {
      if (isFocused && !anyOverlayOpen && terminalRef.current) {
        // Skip redundant focus() when xterm's textarea already has DOM focus —
        // handleFocus() already called term.focus() synchronously on click.
        // A second focus() in the same frame leaves xterm's cursor-blink state
        // machine inconsistent and paints a stale cursor (#41).
        const textarea = containerRef.current?.querySelector('textarea');
        const alreadyFocused = textarea && document.activeElement === textarea;
        if (!alreadyFocused) {
          terminalRef.current.focus();
          // Force a cursor-row redraw so any stale cursor glyph from the
          // previous frame is cleared (#41).
          const cursorY = terminalRef.current.buffer.active.cursorY;
          try { terminalRef.current.refresh(cursorY, cursorY); } catch { /* ignore */ }
        }
        // Immediately refit in case the container size changed (e.g. focus
        // mode shows this pane at full size while it was previously hidden at
        // its split-ratio size).  Using rAF so the DOM layout has settled.
        if (fitAddonRef.current) {
          requestAnimationFrame(() => {
            try {
              fitAddonRef.current?.fit();
              if (terminalRef.current) {
                syncViewportScrollArea(terminalRef.current);
                const { cols, rows } = terminalRef.current;
                window.terminalAPI.resizePty(terminalId, cols, rows);
              }
            } catch { /* terminal may be disposed */ }
          });
        }
      }
    } catch { /* terminal may be disposed */ }
  }, [isFocused, anyOverlayOpen, terminalId]);

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
          syncViewportScrollArea(terminalRef.current);
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
  const groupId = useTerminalStore((s) => s.terminals.get(terminalId)?.groupId);
  const groupColor = useTerminalStore((s) => groupId ? s.tabGroups.get(groupId)?.color : undefined);
  const defaultTabColor = useTerminalStore((s) => (s.config as any)?.defaultTabColor);
  const bgTint = groupColor || tabColor || defaultTabColor;

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
      data-terminal-id={terminalId}
      onMouseDownCapture={(e) => {
        if (!isFocused) {
          // Only suppress mouse events targeting the xterm canvas — this prevents
          // mouse-reporting apps (Claude CLI) from shifting focus, while still
          // letting mousedown reach the viewport element for scroll targeting (#48).
          const target = e.target as HTMLElement;
          if (target.tagName === 'CANVAS' || target.classList.contains('xterm-cursor-layer')) {
            e.stopPropagation();
            window.terminalAPI.diagLog('renderer:pane-switch-click-suppressed', { terminalId });
          }
        }
        handleFocus();
      }}
      onClick={() => {
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
      {title && (
        <div
          className="terminal-pane-title"
          style={bgTint ? { background: bgTint + (isFocused ? '66' : '33') } : undefined}
        >
          <div
            className="status-dot-container"
            onClick={(e) => {
              e.stopPropagation();
              useTerminalStore.getState().closeTerminal(terminalId);
            }}
          >
            <span
              className={`terminal-status-dot ${processStatus}`}
              title={processStatus === 'active' ? 'Active' : processStatus === 'exited-error' ? 'Exited with error' : processStatus === 'idle' ? 'Idle' : 'Exited'}
            />
            <span className="pane-close-x" title="Close pane">✕</span>
          </div>
          {isRenamingPane ? (
            <input
              className="pane-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const trimmed = renameValue.trim();
                  if (trimmed) useTerminalStore.getState().renameTerminal(terminalId, trimmed, true);
                  setIsRenamingPane(false);
                } else if (e.key === 'Escape') {
                  setIsRenamingPane(false);
                }
              }}
              onBlur={() => {
                const trimmed = renameValue.trim();
                if (trimmed) useTerminalStore.getState().renameTerminal(terminalId, trimmed, true);
                setIsRenamingPane(false);
              }}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span
              className="terminal-pane-title-text"
              onDoubleClick={() => {
                setRenameValue(title || '');
                setIsRenamingPane(true);
              }}
            >{title}</span>
          )}
          <button
            className="terminal-diff-btn"
            title="Open diff review"
            onMouseDown={(e) => {
              e.stopPropagation();
              useTerminalStore.getState().openDiffReview(terminalId);
            }}
          >Diff</button>
          <button
            className="terminal-pane-dormant-btn"
            title="Hide pane (dormant)"
            onClick={(e) => {
              e.stopPropagation();
              useTerminalStore.getState().moveToDormant(terminalId);
            }}
          >&#128065;</button>
        </div>
      )}
      {showDiag && <DiagnosticsOverlay terminalId={terminalId} diagRef={diagRef} mainDiag={mainDiagRef.current} logPath={logPathRef.current} onClose={() => setShowDiag(false)} />}
      <div ref={containerRef} className="xterm-container" />
      {bgTint && <div className="terminal-color-overlay" style={{ background: bgTint + '18' }} />}
    </div>
  );
};

export default TerminalPanel;
