import React, { useEffect, useRef, useCallback, useState, useReducer } from 'react';
import ReactDOM from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { useTerminalStore } from '../state/terminal-store';
import { registerTerminal, unregisterTerminal } from '../terminal-registry';
import { saveTerminalBuffer, popTerminalBuffer } from '../terminal-buffer-cache';
import { isMac } from '../utils/platform';
import { runJumpToPromptSearch } from '../utils/jump-to-prompt';
import { prepareClipboardPaste, resolveClipboardPaste } from '../utils/paste';
import { smartUnwrapForCopy } from '../utils/smart-unwrap';
import type { AppConfig } from '../state/types';
import '@xterm/xterm/css/xterm.css';

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function hexToTerminalRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/**
 * Force xterm's viewport to sync its native scroll area with the buffer.
 *
 * xterm 5.5's `Viewport.syncScrollArea()` is gated by four cached fields
 * (`_lastRecordedBufferLength`, `_lastRecordedViewportHeight`,
 * `_lastRecordedBufferHeight`, `_currentDeviceCellHeight`). After a
 * grid/float layout change ends up at the same render dimensions as a
 * previous layout, all four caches match and the call is a no-op — so the
 * .xterm-viewport scrollHeight stays at the stale (often smaller) value:
 *   - Scrollbar thumb is missing or tiny (TASK-50)
 *   - Wheel can only scroll within the stale range (TASK-49)
 *
 * We invalidate the caches and call syncScrollArea(true) (immediate=true,
 * skip rAF) only when the viewport has real geometry — calling against
 * a zero-sized container would just refresh into another bad state.
 *
 * NOTE: Touches xterm 5.5 internals. If you upgrade xterm, re-verify the
 * field names in node_modules/@xterm/xterm/src/browser/Viewport.ts.
 */
function syncViewportScrollArea(term: Terminal): void {
  try {
    const v = (term as any)?._core?.viewport;
    if (!v || typeof v.syncScrollArea !== 'function') return;
    // Bail if the viewport has no real layout yet — _innerRefresh would
    // record zeros and we'd just have to redo this.
    const el: HTMLElement | undefined = v._viewportElement;
    if (el && el.offsetHeight === 0) return;
    v._lastRecordedBufferLength = -1;
    v._lastRecordedViewportHeight = -1;
    v._lastRecordedBufferHeight = -1;
    v._currentDeviceCellHeight = -1;
    v.syncScrollArea(true);
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
  // Drag/maximize handlers for when this pane is rendered inside a
  // FloatingPanel. The float wrapper hands these in so the per-pane title
  // bar can act as the float window's title bar (drag handle + maximize on
  // double-click) - removing the need for a second bar above it.
  floatTitleBar?: {
    onMouseDown: (e: React.MouseEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
  };
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ terminalId, floatTitleBar }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{ resultIndex: number; resultCount: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [processStatus, setProcessStatus] = useState<'active' | 'idle' | 'exited-ok' | 'exited-error'>('idle');
  const processStatusRef = useRef(processStatus);
  const [showDiag, setShowDiag] = useState(false);
  const [isRenamingPane, setIsRenamingPane] = useState(false);
  const statusDotMouseDownDuringRename = useRef(false);
  const [renameValue, setRenameValue] = useState('');
  // Per-pane overflow menu (replaces the row of inline title-bar buttons).
  // Stored as anchor coords so the menu renders fixed-positioned next to ⋯.
  const [paneMenuPos, setPaneMenuPos] = useState<{ x: number; y: number } | null>(null);
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
  // Buffer the user's first typed command so we can use it as the pane title
  // when the shell's OSC title is just "cmd.exe" / "pwsh.exe" / "bash" -
  // those generic names tell you nothing about what's actually running here.
  const firstCmdBufferRef = useRef<string>('');
  const firstCmdSavedRef = useRef(false);
  const wslPromptCleanupRef = useRef<(() => void) | null>(null);
  const textareaDiagCleanupRef = useRef<(() => void) | null>(null);
  // Tracks signals that mean "an app is drawing its own cursor"; either one
  // being on is enough to keep xterm's cursor hidden. See syncCursorVisibility.
  const cursorHideSignalsRef = useRef({ bracketedPaste: false, altScreen: false });
  // TASK-52: read latest config in the copy handlers without rebuilding
  // the terminal. Updated by a small effect below.
  const smartUnwrapRef = useRef<boolean>(true);
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
    // Also skip when the pane's rename input has DOM focus - re-focusing
    // xterm here would synchronously blur the rename input, flip
    // isRenamingPane to false, and (because this fires from the root's
    // onMouseDownCapture) flush a re-render before the target's mousedown
    // handler runs. That breaks the "click status-dot while renaming
    // doesn't close the pane" guard further down the title bar.
    try {
      const textarea = containerRef.current?.querySelector('textarea');
      const renameActive = containerRef.current?.parentElement
        ?.querySelector('.pane-rename-input') === document.activeElement;
      if (!renameActive && (!textarea || document.activeElement !== textarea)) {
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
      scrollback: termConfig?.scrollback ?? 5000,
      cursorStyle: termConfig?.cursorStyle ?? 'block',
      cursorBlink: termConfig?.cursorBlink ?? true,
      cursorInactiveStyle: 'none',
      allowTransparency: bgOpacity < 1,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const serializeAddon = new SerializeAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(serializeAddon);

    // TASK-58: xterm auto-registers an OscLinkProvider for OSC 8 hyperlinks
    // emitted by tools like `gh auth login`. Two real-world bugs result:
    //   (1) On click it falls through to xterm's defaultActivate, which calls
    //       `confirm()` then `window.open()` (no URL) - in Electron our
    //       setWindowOpenHandler denies that empty open AND our custom URL
    //       provider's activate ALSO fires for the same visible text, so the
    //       user sees a confirm dialog plus a stray double-fire.
    //   (2) When a CLI emits an OSC 8 closer that the parser fails to honor,
    //       the urlId attribute leaks across subsequent cells, so EVERY click
    //       on any URL in that scrollback returns the original (e.g. SSO)
    //       URI - clicks get hijacked to one URL.
    // Our custom URL link provider below handles every visible URL uniformly,
    // so the safe fix is to remove the built-in OscLinkProvider and let our
    // provider be the single source of truth for URL clicks.
    try {
      const core = (term as unknown as { _core: { _linkProviderService?: { linkProviders?: unknown[]; _linkProviders?: unknown[] } } })._core;
      const svc = core?._linkProviderService;
      const arr = svc?.linkProviders || svc?._linkProviders;
      if (Array.isArray(arr)) {
        // OscLinkProvider is the only provider auto-registered by xterm's
        // Terminal constructor (see node_modules/@xterm/xterm/.../Terminal.ts).
        // Splice it out before we add our own providers.
        arr.length = 0;
      }
    } catch {
      // If xterm internals change shape, fail open - our custom provider still
      // works, we just may see the OSC 8 issues again. A test guard below
      // (task-58-url-real-click.spec.ts) catches that regression.
    }

    // Custom multi-line URL link provider (#62): xterm's built-in WebLinksAddon
    // stops detecting wrapped URLs past a certain row count, so very long links
    // (e.g. Outlook safelinks) only highlight their first row. We walk the
    // buffer manually to reconstruct the full URL and emit a link range that
    // spans every row the URL visually occupies.
    //
    // Two stitching modes:
    //  - Soft wrap: xterm's `isWrapped` flag groups continuation rows. Each
    //    row holds exactly `cols` cells, so reverse-mapping is just modulo.
    //  - Hard newline (e.g. `gh auth login` formats its SSO URL with explicit
    //    line breaks at ~88 cols): the wrapped flag is false but a URL still
    //    visually continues. We append the next non-wrapped row when (a) the
    //    current row ends in URL-safe characters with no trailing space and
    //    (b) the next row starts with URL-safe characters with no leading
    //    space. That heuristic is tight enough to avoid false-merging unrelated
    //    adjacent text - regular prose has spaces or punctuation at line ends.
    //
    // Regex excludes whitespace/quotes/parens/angle-brackets at the ends, allows
    // `|` and `%` inside (dev tools / URL-encoded chars). Mirrors the old
    // WebLinksAddon regex.
    const urlRegex = /(https?|HTTPS?):\/\/[^\s"'!*(){}\\\^<>`]*[^\s"':,.!?{}\\\^~\[\]`()<>]/g;
    // Characters that can plausibly appear inside a URL split point. Anything
    // outside this set means "this isn't a URL continuation".
    const URL_BODY = /^[A-Za-z0-9%\-._~!$&'()*+,;=:@/?#\[\]|]+$/;
    term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const buf = term.buffer.active;
        // buffer line indexing in provideLinks is 1-based.
        const lineIdx0 = bufferLineNumber - 1;
        if (lineIdx0 < 0 || lineIdx0 >= buf.length) { callback(undefined); return; }

        // Walk back to the logical start of the soft-wrap chain.
        let softStart = lineIdx0;
        while (softStart > 0) {
          const cur = buf.getLine(softStart);
          if (!cur?.isWrapped) break;
          softStart--;
        }
        // Walk forward while the next line is a wrap continuation.
        let softEnd = softStart;
        while (softEnd + 1 < buf.length) {
          const next = buf.getLine(softEnd + 1);
          if (!next?.isWrapped) break;
          softEnd++;
        }

        const cols = term.cols;
        // Each segment maps a buffer row to a slice of `logical`. We tag soft-
        // vs hard-newlined because they're textualised differently:
        //  - soft-wrapped middle rows are exactly cols-wide (no trim) so the
        //    reverse offset->row math stays simple
        //  - hard-newlined rows have padding spaces past their content, so we
        //    trim those (otherwise the URL regex's anti-whitespace anchor
        //    would clip the match at the first padding char)
        interface Seg { rowIdx: number; text: string; logicalStart: number; soft: boolean; leadingWS: number }
        const segs: Seg[] = [];
        let logical = '';
        for (let i = softStart; i <= softEnd; i++) {
          const line = buf.getLine(i);
          if (!line) continue;
          // The trailing soft row also needs trim - it's the only one that
          // may not be cols-wide.
          const text = i < softEnd ? line.translateToString(false) : line.translateToString(true);
          segs.push({ rowIdx: i, text, logicalStart: logical.length, soft: true, leadingWS: 0 });
          logical += text;
        }

        // Hard-newline forward stitch: keep eating the next non-wrapped row
        // as long as the boundary looks URL-shaped on both sides. Bounded to
        // avoid runaway walks through a buffer full of URL-safe lines.
        const MAX_HARD_NEWLINE = 8;
        let stitchedFwd = 0;
        while (stitchedFwd < MAX_HARD_NEWLINE && segs[segs.length - 1] && segs[segs.length - 1].rowIdx + 1 < buf.length) {
          const lastSeg = segs[segs.length - 1];
          const nextRow = lastSeg.rowIdx + 1;
          const next = buf.getLine(nextRow);
          if (!next || next.isWrapped) break;
          // Seam check: no whitespace at end of logical, last char URL-safe.
          if (/\s$/.test(logical)) break;
          const lastCh = logical.charAt(logical.length - 1);
          if (!URL_BODY.test(lastCh)) break;
          const nextTextRaw = next.translateToString(true);
          if (!nextTextRaw) break;
          // Allow an indented continuation: gh and similar CLIs hard-wrap
          // long URLs with the continuation indented under the start of the
          // line. Trim the leading whitespace and remember it for the
          // offset->visual-col mapping. To avoid false-positives where an
          // indented prose paragraph follows a URL ("    bar for more info"),
          // require the trimmed line to be a SINGLE whitespace-free token —
          // wrapped URLs look like long opaque token chains, prose doesn't.
          const wsMatch = nextTextRaw.match(/^(\s*)(\S+)\s*$/);
          if (!wsMatch) break;
          const leadingWS = wsMatch[1].length;
          const nextText = wsMatch[2];
          if (!URL_BODY.test(nextText)) break;

          segs.push({ rowIdx: nextRow, text: nextText, logicalStart: logical.length, soft: false, leadingWS });
          logical += nextText;
          stitchedFwd++;
        }

        // Hard-newline backward stitch: same heuristic, in reverse, so a
        // continuation-row query can rebuild the full URL too.
        let stitchedBack = 0;
        while (stitchedBack < MAX_HARD_NEWLINE && segs[0] && segs[0].rowIdx > 0) {
          const firstSeg = segs[0];
          const prevRow = firstSeg.rowIdx - 1;
          const prev = buf.getLine(prevRow);
          if (!prev) break;
          const prevText = prev.translateToString(true);
          if (!prevText || /\s$/.test(prevText)) break;
          const lastCh = prevText.charAt(prevText.length - 1);
          if (!URL_BODY.test(lastCh)) break;
          // Current first seg must start with a URL-safe token. Tolerate
          // indented continuations: trim leading whitespace before checking
          // the head token, and remember the indent on the seg we're
          // potentially continuing FROM.
          const wsMatch = firstSeg.text.match(/^(\s*)(\S.*)$/);
          if (!wsMatch) break;
          const trimmedFirst = wsMatch[2];
          const tokMatch = trimmedFirst.match(/^(\S+)/);
          if (!tokMatch || !URL_BODY.test(tokMatch[1])) break;
          // If we trimmed the first seg's indent here, persist it so
          // offsetToRowCol places the cursor at the correct visual col on
          // the continuation row.
          if (firstSeg.leadingWS === 0 && wsMatch[1].length > 0) {
            firstSeg.text = trimmedFirst;
            firstSeg.leadingWS = wsMatch[1].length;
            // logical was built before the trim; fix it up.
            logical = logical.slice(0, firstSeg.logicalStart) + trimmedFirst + logical.slice(firstSeg.logicalStart + wsMatch[1].length + trimmedFirst.length);
            for (let s = 1; s < segs.length; s++) segs[s].logicalStart -= wsMatch[1].length;
          }

          // Prepend: shift everything's logicalStart by prevText.length.
          for (const s of segs) s.logicalStart += prevText.length;
          segs.unshift({ rowIdx: prevRow, text: prevText, logicalStart: 0, soft: false, leadingWS: 0 });
          logical = prevText + logical;
          stitchedBack++;
        }

        const links: Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } };
          text: string;
          activate: (e: MouseEvent, text: string) => void;
          decorations?: { underline?: boolean; pointerCursor?: boolean };
        }> = [];

        // Find the segment that contains a given offset in `logical`. Returns
        // (rowIdx, col) where col is 0-based within that visual row.
        function offsetToRowCol(offset: number): { row: number; col: number } {
          for (let s = segs.length - 1; s >= 0; s--) {
            const seg = segs[s];
            if (offset >= seg.logicalStart) {
              const within = offset - seg.logicalStart;
              // Soft-wrapped segments live on a cols-wide grid: an offset
              // larger than `cols` rolls onto the soft-wrap continuation row.
              // Hard-newlined segments are variable width and stay on their
              // own row; we don't roll them. For hard-newlined segs that had
              // their leading indent trimmed, shift the col back to the
              // original visual position.
              if (seg.soft && within >= cols) {
                return { row: seg.rowIdx + Math.floor(within / cols), col: within % cols };
              }
              return { row: seg.rowIdx, col: within + seg.leadingWS };
            }
          }
          return { row: segs[0]?.rowIdx ?? 0, col: 0 };
        }

        let m: RegExpExecArray | null;
        urlRegex.lastIndex = 0;
        while ((m = urlRegex.exec(logical)) !== null) {
          const matchStart = m.index;
          const matchEnd = m.index + m[0].length - 1;
          const a = offsetToRowCol(matchStart);
          const b = offsetToRowCol(matchEnd);
          // Only emit if this link visually touches the row the linkifier
          // asked about. Clip the link's range to JUST that row — emitting a
          // multi-row range from every row the URL spans causes xterm to
          // register one link per row, and a click on the wrapped underline
          // would fire activate() once per row (== open the URL N times).
          if (lineIdx0 < a.row || lineIdx0 > b.row) continue;

          const startX = lineIdx0 === a.row ? a.col + 1 : 1;
          const endX = lineIdx0 === b.row ? b.col + 1 : term.cols;

          links.push({
            range: {
              start: { x: startX, y: lineIdx0 + 1 },
              end: { x: endX, y: lineIdx0 + 1 },
            },
            text: m[0],
            activate(_e, uri) {
              // TASK-58 diagnostic: trace duplicate activations
              try {
                (window as unknown as { __tmaxLinkActivates?: number }).__tmaxLinkActivates =
                  ((window as unknown as { __tmaxLinkActivates?: number }).__tmaxLinkActivates || 0) + 1;
                console.warn('[tmax TASK-58] URL activate', {
                  uri,
                  count: (window as unknown as { __tmaxLinkActivates: number }).__tmaxLinkActivates,
                  providers: ((term as unknown as { _core: { _linkProviderService: { linkProviders?: unknown[] } } })
                    ._core?._linkProviderService?.linkProviders || []).length,
                });
              } catch { /* noop */ }
              window.open(uri, '_blank');
            },
            decorations: { underline: true, pointerCursor: true },
          });
        }

        callback(links.length ? links : undefined);
      },
    });

    // Register link provider for .md file paths (Ctrl+Click to preview)
    term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = term.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) { callback(undefined); return; }
        const text = line.translateToString();
        // Match file paths ending in .md (absolute or relative)
        const mdPathRegex = /(?:[a-zA-Z]:[\\/]|[\/~.])?[^\s"'`<>|:*?]*\.md\b/gi;
        const links: Array<{ range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: () => void; tooltip: string }> = [];
        let match: RegExpExecArray | null;
        while ((match = mdPathRegex.exec(text)) !== null) {
          const startX = match.index + 1;
          const endX = match.index + match[0].length;
          const matchedPath = match[0];
          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: endX, y: bufferLineNumber },
            },
            text: matchedPath,
            tooltip: `Ctrl+Click to preview: ${matchedPath}`,
            activate() {
              const termInst = useTerminalStore.getState().terminals.get(terminalId);
              const cwd = termInst?.cwd || '';
              // Resolve relative paths against terminal cwd
              let fullPath = matchedPath;
              if (!/^[a-zA-Z]:/.test(matchedPath) && !matchedPath.startsWith('/') && !matchedPath.startsWith('~')) {
                const sep = cwd.includes('\\') ? '\\' : '/';
                fullPath = cwd + sep + matchedPath;
              }
              (window.terminalAPI as any).fileRead(fullPath).then((content: string | null) => {
                if (content !== null) {
                  const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
                  useTerminalStore.setState({ markdownPreview: { filePath: fullPath, content, fileName } });
                }
              });
            },
          });
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    searchAddonRef.current = searchAddon;
    registerTerminal(terminalId, term, searchAddon, (value: boolean) => {
      cursorHideSignalsRef.current.bracketedPaste = value;
    });

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
        const decision = resolveClipboardPaste({
          hasImage: window.terminalAPI.clipboardHasImage(),
          html: window.terminalAPI.clipboardReadHTML(),
          plainText: window.terminalAPI.clipboardRead(),
        });
        if (decision.kind === 'image') {
          window.terminalAPI.clipboardSaveImage().then((filePath) => {
            window.terminalAPI.writePty(terminalId, filePath);
          });
        } else if (decision.kind === 'text') {
          const payload = prepareClipboardPaste(decision.text, cursorHideSignalsRef.current.bracketedPaste);
          window.terminalAPI.writePty(terminalId, payload);
        }
        return false;
      }
      // Ctrl+C with selection: copy instead of SIGINT (Cmd+C on Mac)
      if ((isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && (event.key === 'c' || event.key === 'C') && term.hasSelection()) {
        // xterm 5.5 uses a real DOM selection — browser's default Ctrl+C
        // would fire after this handler and overwrite our unwrapped clipboard
        // write with the raw newline-preserved selection. Block it.
        event.preventDefault();
        window.terminalAPI.clipboardWrite(smartUnwrapForCopy(term.getSelection(), smartUnwrapRef.current));
        term.clearSelection();
        return false;
      }
      // Plain Enter with an active selection: copy and clear selection instead
      // of submitting (Windows Terminal "Quick Edit" / cmd.exe convention, #71).
      // Only plain Enter - Ctrl/Shift/Alt+Enter still pass through so apps that
      // use modified Enter (Claude Code's Shift+Enter newline, etc.) aren't affected.
      const isPlainEnterKey = (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter')
        && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
      if (isPlainEnterKey && term.hasSelection()) {
        event.preventDefault(); // Stop xterm's textarea from seeing the newline and echoing CR
        window.terminalAPI.clipboardWrite(smartUnwrapForCopy(term.getSelection(), smartUnwrapRef.current));
        term.clearSelection();
        return false;
      }
      // Ctrl+Shift+C (Cmd+Shift+C on Mac): always copy selection
      if ((isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && (event.key === 'c' || event.key === 'C')) {
        const sel = term.getSelection();
        if (sel) {
          event.preventDefault(); // see comment in plain Ctrl+C above
          window.terminalAPI.clipboardWrite(smartUnwrapForCopy(sel, smartUnwrapRef.current));
        }
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
      // Shift+Enter: send ESC+CR which Claude Code's and Copilot CLI's Ink-based
      // input parsers interpret as Meta+Enter (a.k.a. Alt+Enter) → insert newline
      // in the multi-line input box instead of submitting (#68). Verified against
      // Claude Code's bundled input parser, which sets `meta=true` when the raw
      // sequence starts with ESC. This is also what VS Code's terminal sends for
      // Shift+Enter via its `workbench.action.terminal.sendSequence` keybinding.
      // Earlier attempts with CSI-u (\x1b[13;2u), plain LF, and win32-input-mode
      // did not work reliably against either CLI.
      const isShiftEnterOnly = (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter')
        && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
      if (isShiftEnterOnly) {
        event.preventDefault();
        window.terminalAPI.writePty(terminalId, '\x1b\r');
        return false;
      }
      return true;
    });

    term.open(containerRef.current);

    // Hide xterm's helper textarea from UI Automation as strongly as we can
    // without breaking keyboard input. Windows Voice Access and other UIA-based
    // dictation tools discover the textarea, treat it as a real text field,
    // and split a single utterance across multiple IME compositions whose
    // chunks reach the PTY out of order (see TASK-53: dictating
    // "I'm testing this again" + "Testing speech." produced the spliced
    // string "I'm teTesting speech.ing this again."). The data-corruption
    // ordering is decided by Voice Access *before* xterm sees it, so no
    // amount of textarea-state reset on our side fixes it - the only reliable
    // mitigation is to convince Voice Access to ignore the field entirely.
    // Windows Terminal achieves this by not exposing a UIA text field at all;
    // we layer every standard-DOM hide we have so Voice Access skips us and
    // dictation falls back to OS keystroke injection (or the user uses Win+H,
    // which routes through TSF and types straight into the prompt).
    try {
      const helperTextarea = containerRef.current.querySelector('textarea') as HTMLTextAreaElement | null;
      if (helperTextarea) {
        helperTextarea.setAttribute('aria-hidden', 'true');
        helperTextarea.setAttribute('role', 'presentation');
        // tabindex=-1 keeps programmatic focus working (xterm calls
        // textarea.focus()) but removes the textarea from sequential focus
        // navigation, which is one of the cues UIA-based dictation tools use
        // to decide a control is a "real" input target.
        helperTextarea.setAttribute('tabindex', '-1');
        // Override xterm's aria-label ("Terminal input"). A blank label plus
        // role=presentation makes the field look like a styling helper
        // rather than a labelled input.
        helperTextarea.setAttribute('aria-label', '');
        // aria-readonly=true tells UIA TextPattern this field doesn't accept
        // text input via the Insert pattern. Voice Access uses this to skip
        // read-only fields. Real keyboard typing is unaffected (browsers don't
        // honour aria-readonly for actual input gating).
        helperTextarea.setAttribute('aria-readonly', 'true');
      }
      // Also hide the parent xterm-helpers container - some accessibility
      // walkers stop at an aria-hidden ancestor.
      const helperContainer = containerRef.current.querySelector('.xterm-helpers');
      if (helperContainer) {
        helperContainer.setAttribute('aria-hidden', 'true');
      }
    } catch { /* xterm internals changed; non-fatal */ }

    // Diagnostic logging for STT/dictation drift (TASK-53). Captures every
    // input/composition event that reaches the helper textarea so we can
    // see exactly what Voice Access (or any other dictation engine) feeds
    // us. Gated by the existing diag logger; logs are line-rate-limited
    // per terminal, so dictating a sentence won't flood the file.
    try {
      const hta = containerRef.current.querySelector('textarea') as HTMLTextAreaElement | null;
      if (hta) {
        const snap = (label: string, ev?: Event) => {
          const e = ev as InputEvent | CompositionEvent | undefined;
          window.terminalAPI.diagLog(`renderer:textarea:${label}`, {
            terminalId,
            valueLen: hta.value.length,
            valueTail: hta.value.slice(-32),
            selStart: hta.selectionStart,
            selEnd: hta.selectionEnd,
            inputType: (e as InputEvent)?.inputType,
            data: (e as InputEvent | CompositionEvent)?.data,
            isComposing: (e as InputEvent)?.isComposing,
          });
        };
        const onComposStart = (ev: Event) => snap('compositionstart', ev);
        const onComposUpdate = (ev: Event) => snap('compositionupdate', ev);
        const onComposEnd = (ev: Event) => snap('compositionend', ev);
        const onBeforeInput = (ev: Event) => snap('beforeinput', ev);
        const onInput = (ev: Event) => snap('input', ev);
        hta.addEventListener('compositionstart', onComposStart, true);
        hta.addEventListener('compositionupdate', onComposUpdate, true);
        hta.addEventListener('compositionend', onComposEnd, true);
        hta.addEventListener('beforeinput', onBeforeInput, true);
        hta.addEventListener('input', onInput, true);
        textareaDiagCleanupRef.current = () => {
          hta.removeEventListener('compositionstart', onComposStart, true);
          hta.removeEventListener('compositionupdate', onComposUpdate, true);
          hta.removeEventListener('compositionend', onComposEnd, true);
          hta.removeEventListener('beforeinput', onBeforeInput, true);
          hta.removeEventListener('input', onInput, true);
        };
      }
    } catch { /* non-fatal */ }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;

    // Restore buffer from a previous mount (e.g. after float↔dock move or
    // grid rebuild). Write the serialized content before fitting so the
    // buffer is populated at its original dimensions first.
    const savedBuffer = popTerminalBuffer(terminalId);
    if (savedBuffer) {
      try {
        term.resize(savedBuffer.cols, savedBuffer.rows);
      } catch { /* container may constrain size */ }
      term.write(savedBuffer.serialized);
    }

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        syncViewportScrollArea(term);
      } catch {
        // Container may not be sized yet
      }
    });

    // Pre-sync for the "wheel-down stops short of the live prompt during
    // streaming" failure mode (TASK-62). xterm 5.5's Viewport caches the
    // buffer length on a rAF-debounced refresh, so during continuous PTY
    // output the .xterm-viewport scrollHeight lags the real buffer by a
    // frame. The browser then clamps `scrollTop += amount` against that
    // stale scrollHeight, leaving the user one or more lines above the
    // bottom even on a vigorous wheel-down. We sync the viewport BEFORE
    // xterm sees the wheel so it dispatches against the fresh scrollHeight.
    const wheelPreSyncHandler = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.shiftKey) return;
      try {
        const v: any = (term as any)?._core?.viewport;
        if (!v) return;
        // Only sync when the buffer has actually grown beyond what the
        // viewport last recorded (or the cache hasn't been seeded yet).
        // This keeps idle terminals on the existing fast path.
        const bufLen = term.buffer.active.length;
        if (bufLen > v._lastRecordedBufferLength) {
          syncViewportScrollArea(term);
        }
      } catch { /* viewport may not be ready */ }
    };
    // Auto-recovery for the "wheel does nothing" failure mode. xterm's
    // viewport scrollArea occasionally desyncs from the buffer (after pane
    // moves, focus-mode toggles, etc.) so wheel events fire but the
    // viewport's scrollTop never moves. Catch that here and re-sync; the
    // next wheel will work.
    const wheelRecoveryHandler = (e: WheelEvent) => {
      // Only recover when there's a real direction the wheel SHOULD scroll
      // but didn't — otherwise we'd thrash sync calls at scroll boundaries
      // and on shift/horizontal wheels.
      if (e.deltaY === 0 || e.shiftKey) return;
      const viewport = containerRef.current?.querySelector('.xterm-viewport') as HTMLElement | null;
      if (!viewport) return;
      const before = viewport.scrollTop;
      const canScrollUp = before > 0;
      const canScrollDown = before + viewport.clientHeight < viewport.scrollHeight;
      const wantUp = e.deltaY < 0;
      if ((wantUp && !canScrollUp) || (!wantUp && !canScrollDown)) return;
      requestAnimationFrame(() => {
        if (viewport.scrollTop === before) {
          syncViewportScrollArea(term);
        }
      });
    };
    // Manual escape hatch: double-click the right edge (where the scrollbar
    // would be) forces a sync. Useful when the auto-recovery hasn't yet
    // kicked in - the user can manually refresh the scroll area.
    const manualSyncHandler = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Only fire if the dblclick was within ~16px of the right edge.
      if (e.clientX < rect.right - 18) return;
      try { syncViewportScrollArea(term); } catch { /* ignore */ }
    };
    const wheelRecoveryEl = containerRef.current;
    // Capture phase so the sync runs BEFORE xterm's wheel handler computes
    // the new scrollTop against the (possibly stale) scrollHeight.
    wheelRecoveryEl?.addEventListener('wheel', wheelPreSyncHandler, { passive: true, capture: true });
    wheelRecoveryEl?.addEventListener('wheel', wheelRecoveryHandler, { passive: true });
    wheelRecoveryEl?.addEventListener('dblclick', manualSyncHandler);

    // Write data to PTY when user types. When broadcast mode is on, the same
    // bytes are sent to every tiled pane (tmux synchronize-panes style).
    const dataDisposable = term.onData((data) => {
      diagRef.current.keystrokeCount++;
      diagRef.current.lastKeystrokeTime = Date.now();
      window.terminalAPI.diagLog('renderer:keystroke', { terminalId, bytes: data.length });

      // Watch for the user's first complete command (anything before the
      // first Enter) so we can rename the pane from a generic "cmd.exe"
      // to something meaningful like "npx vibe-kanban". Only matters for
      // non-AI panes; AI sessions get their title from the session summary.
      if (!firstCmdSavedRef.current) {
        const inst = useTerminalStore.getState().terminals.get(terminalId);
        if (inst && !inst.aiSessionId && !inst.customTitle) {
          for (let i = 0; i < data.length; i++) {
            const ch = data[i];
            const code = data.charCodeAt(i);
            if (ch === '\r' || ch === '\n') {
              const cmd = firstCmdBufferRef.current.trim();
              firstCmdBufferRef.current = '';
              if (cmd.length >= 2 && cmd.length <= 80) {
                firstCmdSavedRef.current = true;
                useTerminalStore.getState().renameTerminal(terminalId, cmd, true);
                break;
              }
            } else if (code === 0x7f || code === 0x08) {
              firstCmdBufferRef.current = firstCmdBufferRef.current.slice(0, -1);
            } else if (code === 0x03) {
              firstCmdBufferRef.current = '';
            } else if (code === 0x1b) {
              // Escape sequence (arrows, etc.) - skip past the rest of it
              while (i + 1 < data.length && /[a-zA-Z~]/.test(data[i + 1]) === false) i++;
              i++;
            } else if (code >= 0x20 && code < 0x80) {
              firstCmdBufferRef.current += ch;
            }
          }
        } else {
          // Pane already has an aiSessionId or a custom title - don't keep watching.
          firstCmdSavedRef.current = true;
        }
      }

      const state = useTerminalStore.getState();
      if (state.broadcastMode) {
        for (const [id, t] of state.terminals) {
          if (t.mode === 'tiled') window.terminalAPI.writePty(id, data);
        }
      } else {
        window.terminalAPI.writePty(terminalId, data);
      }
    });

    // Receive data from PTY — batch writes via rAF to avoid saturating the
    // renderer event loop during output bursts (e.g. after system resume).
    let pendingData = '';
    let rafScheduled = false;
    let cursorSyncDirty = false;

    // Prompt-line highlight (TASK-48 + TASK-53). Visually distinguish lines
    // that look like CLI-agent user prompts (Copilot CLI / Claude Code
    // render submitted prompts as `>`/`›`/`❯` history entries). We scan
    // newly-written buffer lines and attach an xterm decoration as a
    // left-border accent bar. Heuristic only.
    //   `>` — Claude Code, generic
    //   `›` (U+203A) — Copilot CLI
    //   `❯` (U+276F) — Starship/oh-my-zsh + some agents
    const promptDecorations = new Set<{ dispose: () => void; isDisposed?: boolean }>();
    const decoratedLineKeys = new Set<string>();
    let lastScannedAbsY = -1;
    const PROMPT_RE = /^[>\u203A\u276F]\s/;
    const scanForPromptLines = () => {
      try {
        const buffer = term.buffer.active;
        // Only scan the normal buffer — alt-screen TUIs (vim, less, htop)
        // overwrite the screen and decoration markers there are noise.
        if (buffer.type !== 'normal') return;
        const cursorAbsY = buffer.baseY + buffer.cursorY;
        const startY = Math.max(0, lastScannedAbsY + 1);
        const endY = cursorAbsY;
        for (let y = startY; y <= endY; y++) {
          const line = buffer.getLine(y);
          if (!line) continue;
          const text = line.translateToString(true);
          if (!PROMPT_RE.test(text)) continue;
          // Dedupe: a line might be re-rendered while still being typed.
          const key = `${y}:${text.slice(0, 32)}`;
          if (decoratedLineKeys.has(key)) continue;
          decoratedLineKeys.add(key);
          const marker = term.registerMarker(y - cursorAbsY);
          if (!marker) continue;
          const dec = term.registerDecoration({
            marker,
            x: 0,
            width: 1,
            height: 1,
            // Use the theme's focus-border accent so the bar sits in the
            // existing palette instead of clashing as bright green.
            backgroundColor: themeConfig?.cursor ?? '#89B4FA',
            layer: 'top',
          });
          if (dec) promptDecorations.add(dec);
        }
        // Don't lock in the cursor line — it may still be receiving content.
        lastScannedAbsY = Math.max(lastScannedAbsY, endY - 1);
      } catch { /* defensive: xterm internals may shift */ }
    };

    const flushPendingData = () => {
      rafScheduled = false;
      if (pendingData) {
        term.write(pendingData, () => scanForPromptLines());
        pendingData = '';
      }
      // Apply our cursor override AFTER the PTY data is written. In xterm,
      // DECTCEM (cursor visibility) is per-buffer, so if the data switched
      // to alt-screen, writing ?25l before it had no effect on the alt
      // buffer's cursor state. Writing it here hits whichever buffer is
      // active post-data.
      if (cursorSyncDirty) {
        cursorSyncDirty = false;
        const shouldHide = cursorHideSignalsRef.current.bracketedPaste || cursorHideSignalsRef.current.altScreen;
        term.write(shouldHide ? '\x1b[?25l' : '\x1b[?25h');
      }
    };

    // #67: Ink-based CLIs (Claude Code, Copilot CLI) enable bracketed paste
    // but don't send DECTCEM (\x1b[?25l) to hide the terminal's hardware
    // cursor before painting their own cursor indicator. Result: two cursors
    // render side-by-side.
    //
    // We track two signals - bracketed paste (?2004) and alt-screen (?1049) -
    // and keep xterm's cursor hidden whenever EITHER is on. Using only
    // bracketed paste wasn't enough: some TUIs toggle ?2004l mid-session
    // while still drawing their own cursor in alt-screen, and that flipped
    // xterm's cursor back on. The per-terminal state refs persist across
    // data chunks; the actual cursor write happens in flushPendingData so
    // it runs AFTER any alt-screen switch in the same data chunk.
    const syncCursorVisibility = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk.charCodeAt(i) !== 0x1b) continue;
        if (chunk.startsWith('\x1b[?2004h', i)) { cursorHideSignalsRef.current.bracketedPaste = true; cursorSyncDirty = true; }
        else if (chunk.startsWith('\x1b[?2004l', i)) { cursorHideSignalsRef.current.bracketedPaste = false; cursorSyncDirty = true; }
        else if (chunk.startsWith('\x1b[?1049h', i) || chunk.startsWith('\x1b[?1047h', i)) {
          cursorHideSignalsRef.current.altScreen = true; cursorSyncDirty = true;
        }
        else if (chunk.startsWith('\x1b[?1049l', i) || chunk.startsWith('\x1b[?1047l', i)) {
          cursorHideSignalsRef.current.altScreen = false; cursorSyncDirty = true;
        }
        // If the app tries to flip the hardware cursor while either of our
        // hide signals is on, queue a re-hide for after this chunk lands.
        // Claude Code / Copilot CLI emit ?25h when drawing their input field
        // and used to slip past us, painting xterm's cursor next to theirs.
        else if (chunk.startsWith('\x1b[?25h', i) || chunk.startsWith('\x1b[?25l', i)) {
          if (cursorHideSignalsRef.current.bracketedPaste || cursorHideSignalsRef.current.altScreen) {
            cursorSyncDirty = true;
          }
        }
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
          syncCursorVisibility(data);
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
            if (isWsl) {
              // WSL: keep Linux-style forward slashes; prefix with / for absolute path
              detectedDir = '/' + decoded;
            } else if (/^[A-Za-z]:/.test(decoded)) {
              // Windows path (C:/Users/...) — convert to backslashes
              detectedDir = decoded.replace(/\//g, '\\');
            } else {
              // macOS/Linux path — keep forward slashes, ensure leading /
              detectedDir = decoded.startsWith('/') ? decoded : '/' + decoded;
            }
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

    // Focus tracking via textarea focus/blur
    const textareaEl = containerRef.current.querySelector('textarea');
    const handleBlur = () => {
      window.terminalAPI.diagLog('renderer:focus-lost', { terminalId });
      // Re-focus if this terminal is still the active one AND nothing else explicitly took
      // focus. Check document.activeElement instead of overlay visibility flags — a panel
      // being visible (e.g. Copilot sidebar) doesn't mean it holds keyboard focus.
      requestAnimationFrame(() => {
        if (useTerminalStore.getState().focusedTerminalId !== terminalId) return;
        // If the window itself lost OS focus (e.g. Windows Voice Access, a screen reader, or
        // any other out-of-process overlay grabbed focus), don't fight it. Stealing focus
        // back here causes a tug-of-war that breaks dictation and misplaces UIA-anchored
        // overlays. The handleWindowFocus path below restores xterm focus when the user
        // comes back to the window.
        if (!document.hasFocus()) return;
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
          syncViewportScrollArea(term);
          const { cols, rows } = term;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        } catch {
          // Ignore resize errors during teardown
        }
      }, 30);
    });
    resizeObserver.observe(containerRef.current);

    // Suppress right-button mousedown/mouseup in capture phase so xterm.js
    // doesn't forward SGR mouse events to the pty. Otherwise TUI apps with
    // mouse reporting enabled (e.g. Claude Code) receive the right-click on
    // top of our own paste, causing a visible double-paste.
    const handleRightMouseButton = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    containerRef.current.addEventListener('mousedown', handleRightMouseButton, true);
    containerRef.current.addEventListener('mouseup', handleRightMouseButton, true);

    // Right-click: copy if selection, paste if no selection
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (term.hasSelection()) {
        window.terminalAPI.clipboardWrite(smartUnwrapForCopy(term.getSelection(), smartUnwrapRef.current));
        term.clearSelection();
      } else {
        const decision = resolveClipboardPaste({
          hasImage: window.terminalAPI.clipboardHasImage(),
          html: window.terminalAPI.clipboardReadHTML(),
          plainText: window.terminalAPI.clipboardRead(),
        });
        if (decision.kind === 'image') {
          window.terminalAPI.clipboardSaveImage().then((filePath) => {
            window.terminalAPI.writePty(terminalId, filePath);
          });
        } else if (decision.kind === 'text') {
          const payload = prepareClipboardPaste(decision.text, cursorHideSignalsRef.current.bracketedPaste);
          window.terminalAPI.writePty(terminalId, payload);
        }
      }
    };
    // Use capture phase to intercept before any other handler
    containerRef.current.addEventListener('contextmenu', handleContextMenu, true);

    // Intercept the document-level `copy` event for this pane so that the
    // browser's default copy (which would write the raw DOM-selected text
    // with hard newlines) gets rewritten through smartUnwrapForCopy. This
    // catches OS-level Ctrl+C paths the keydown handler can miss (e.g. when
    // focus shifts away from the xterm helper textarea after a mouse-drag
    // selection).
    const handleCopyEvent = (e: ClipboardEvent) => {
      try {
        const sel = term.hasSelection() ? term.getSelection() : '';
        if (!sel) return; // let the browser do its thing
        const out = smartUnwrapForCopy(sel, smartUnwrapRef.current);
        e.preventDefault();
        e.clipboardData?.setData('text/plain', out);
        // Mirror to the system clipboard via our IPC too — DOM clipboardData
        // only populates the synthetic event, not the OS clipboard, when
        // preventDefault has been called inside an Electron renderer.
        window.terminalAPI.clipboardWrite(out);
      } catch { /* defensive */ }
    };
    containerRef.current.addEventListener('copy', handleCopyEvent, true);

    const containerEl = containerRef.current;

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      unsubscribePtyData();
      unsubscribePtyExit();
      wslPromptCleanupRef.current?.();
      textareaDiagCleanupRef.current?.();
      textareaDiagCleanupRef.current = null;
      if (textareaEl) {
        textareaEl.removeEventListener('focus', handleFocus);
        textareaEl.removeEventListener('blur', handleBlur);
      }
      containerEl.removeEventListener('contextmenu', handleContextMenu, true);
      containerEl.removeEventListener('copy', handleCopyEvent, true);
      containerEl.removeEventListener('mousedown', handleRightMouseButton, true);
      containerEl.removeEventListener('mouseup', handleRightMouseButton, true);
      wheelRecoveryEl?.removeEventListener('wheel', wheelPreSyncHandler, true);
      wheelRecoveryEl?.removeEventListener('wheel', wheelRecoveryHandler);
      wheelRecoveryEl?.removeEventListener('dblclick', manualSyncHandler);
      titleDisposable.dispose();
      // Flush any pending PTY data so serialize captures the latest content
      if (pendingData) {
        term.write(pendingData);
        pendingData = '';
      }
      // Dispose prompt-line decorations before tearing down the terminal.
      for (const dec of promptDecorations) {
        try { dec.dispose(); } catch { /* ignore */ }
      }
      promptDecorations.clear();
      decoratedLineKeys.clear();
      // Save buffer before dispose so a remount can restore it
      try {
        const serialized = serializeAddon.serialize();
        saveTerminalBuffer(terminalId, serialized, term.cols, term.rows);
      } catch (e) {
        console.warn('[tmax] Failed to serialize terminal buffer:', terminalId, e);
      }
      unregisterTerminal(terminalId);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      serializeAddonRef.current = null;
    };
  }, [terminalId, handleFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // TASK-52: keep smart-unwrap toggle in sync with the live config so the
  // copy handlers (which capture config at terminal-init time) read the
  // current value.
  useEffect(() => {
    smartUnwrapRef.current = config?.terminal?.smartUnwrapCopy ?? true;
  }, [config?.terminal?.smartUnwrapCopy]);

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
  // xterm's viewport scrollbar stale. A delayed refit + a follow-up
  // rAF sync catches the case where the first refresh happens before the
  // browser has finished re-laying out the new flex/grid cells (TASK-49).
  const viewMode = useTerminalStore((s) => s.viewMode);
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current) return;
    const doFitAndSync = () => {
      try {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          syncViewportScrollArea(terminalRef.current);
          const { cols, rows } = terminalRef.current;
          window.terminalAPI.resizePty(terminalId, cols, rows);
        }
      } catch { /* terminal may be disposed */ }
    };
    const timer = setTimeout(() => {
      doFitAndSync();
      // Second pass after layout settles — fixes TASK-49 grid scrollback.
      requestAnimationFrame(() => {
        if (terminalRef.current) syncViewportScrollArea(terminalRef.current);
      });
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
  // Workspace tint: only applies when in workspaces mode (TASK-40). Falls
  // through tab/group color so per-tab overrides still win.
  const workspaceColor = useTerminalStore((s) => {
    if (s.config?.tabMode !== 'workspaces') return undefined;
    const wsId = s.terminals.get(terminalId)?.workspaceId ?? s.activeWorkspaceId;
    return s.workspaces.get(wsId)?.color;
  });
  const bgTint = groupColor || workspaceColor || tabColor || defaultTabColor;

  // Latest prompt from the AI session (if any) linked to this pane. Surfaces
  // the most recent user message so you don't have to scroll up through a
  // long agent run to remember what was asked.
  const aiSessionId = useTerminalStore((s) => s.terminals.get(terminalId)?.aiSessionId);
  const paneMode = useTerminalStore((s) => s.terminals.get(terminalId)?.mode);
  const paneCwd = useTerminalStore((s) => s.terminals.get(terminalId)?.cwd);
  const latestPrompt = useTerminalStore((s) => {
    if (!aiSessionId) return undefined;
    const cc = s.claudeCodeSessions.find((x) => x.id === aiSessionId);
    if (cc?.latestPrompt) return cc.latestPrompt;
    const cp = s.copilotSessions.find((x) => x.id === aiSessionId);
    return cp?.latestPrompt;
  });
  const latestPromptTime = useTerminalStore((s) => {
    if (!aiSessionId) return undefined;
    const cc = s.claudeCodeSessions.find((x) => x.id === aiSessionId);
    if (cc?.latestPromptTime) return cc.latestPromptTime;
    const cp = s.copilotSessions.find((x) => x.id === aiSessionId);
    return cp?.latestPromptTime;
  });
  const sessionStatus = useTerminalStore((s) => {
    if (!aiSessionId) return undefined;
    const cc = s.claudeCodeSessions.find((x) => x.id === aiSessionId);
    if (cc) return cc.status;
    const cp = s.copilotSessions.find((x) => x.id === aiSessionId);
    return cp?.status;
  });
  // Force a re-render every 30s so the relative time stays fresh even when
  // nothing else in the session changes.
  const [, tickForClock] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!latestPromptTime) return;
    const id = setInterval(() => tickForClock(), 30_000);
    return () => clearInterval(id);
  }, [latestPromptTime]);

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

  const jumpToLatestPrompt = useCallback(() => {
    const text = (latestPrompt || '').trim();
    const search = searchAddonRef.current;
    const term = terminalRef.current;
    if (!search || !term || !text) return;
    runJumpToPromptSearch(search, term, text);
  }, [latestPrompt]);

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
          className={`terminal-pane-title${floatTitleBar ? ' float-titlebar' : ''}`}
          style={bgTint ? { background: bgTint + (isFocused ? '66' : '33') } : undefined}
          onMouseDown={floatTitleBar?.onMouseDown}
          onDoubleClick={floatTitleBar?.onDoubleClick}
        >
          <div
            className="status-dot-container"
            onMouseDown={(e) => {
              // The pane root has an onMouseDownCapture that re-focuses
              // xterm; that fires *before* this handler in the capture
              // phase, blurring the rename input which flips
              // isRenamingPane=false synchronously. So the React state we
              // see here is already stale. Use DOM presence of the rename
              // input as the source of truth instead.
              const parent = e.currentTarget.parentElement as HTMLElement | null;
              const renameInput = parent?.querySelector('.pane-rename-input');
              statusDotMouseDownDuringRename.current = !!renameInput;
              // Also stop the parent's mousedown chain so the input doesn't
              // lose focus to the xterm textarea: keeps the user in rename
              // mode after the accidental click.
              if (renameInput) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (statusDotMouseDownDuringRename.current) {
                statusDotMouseDownDuringRename.current = false;
                return;
              }
              useTerminalStore.getState().closeTerminal(terminalId);
            }}
          >
            <span
              className={`terminal-status-dot ${processStatus}`}
              title={processStatus === 'active' ? 'Active' : processStatus === 'exited-error' ? 'Exited with error' : processStatus === 'idle' ? 'Idle' : 'Exited'}
            />
            <span className="pane-close-x" title="Close pane (Ctrl+Shift+W)">✕</span>
          </div>
          {isRenamingPane ? (
            <input
              className="pane-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  const trimmed = renameValue.trim();
                  if (trimmed) useTerminalStore.getState().renameTerminal(terminalId, trimmed, true);
                  setIsRenamingPane(false);
                } else if (e.key === 'Escape') {
                  setIsRenamingPane(false);
                }
              }}
              onBlur={() => {
                // Commit on blur, but only when the focus actually went to
                // something outside this input. Clicking inside the input to
                // position the cursor used to bubble a parent mousedown that
                // re-focused the xterm textarea; the e.stopPropagation() on
                // mousedown above prevents that, so blur now genuinely means
                // 'user clicked elsewhere or pressed Tab'.
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
              onDoubleClick={(e) => {
                // In float mode the parent has its own dblclick handler
                // (maximize-toggle); we don't want both rename AND maximize
                // on a single dblclick.
                e.stopPropagation();
                setRenameValue(title || '');
                setIsRenamingPane(true);
              }}
            >{title}</span>
          )}
          <button
            className="terminal-pane-menu-btn"
            title="Pane actions"
            aria-label="Pane actions"
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPaneMenuPos({ x: r.right, y: r.bottom });
            }}
          >&#x22EF;</button>
        </div>
      )}
      {paneMenuPos && ReactDOM.createPortal(
        // Portal to body so the menu's `position: fixed` is resolved against
        // the viewport rather than the panel. `.terminal-panel` has
        // `contain: layout style` (it scopes layout/paint for terminal
        // updates), which makes it a containing block for fixed descendants
        // - so without the portal the menu lands at panel-relative coords
        // and can end up off-screen in multi-pane layouts.
        <>
          <div
            className="pane-menu-backdrop"
            onClick={() => setPaneMenuPos(null)}
            onContextMenu={(e) => { e.preventDefault(); setPaneMenuPos(null); }}
          />
          <div
            className="context-menu"
            style={{
              position: 'fixed',
              right: Math.max(4, window.innerWidth - paneMenuPos.x),
              top: paneMenuPos.y + 4,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="context-menu-item" onClick={() => {
              setPaneMenuPos(null);
              useTerminalStore.getState().openDiffReview(terminalId);
            }}>🔀 Diff review</button>
            <button className="context-menu-item" onClick={() => {
              setPaneMenuPos(null);
              setRenameValue(title || '');
              setIsRenamingPane(true);
            }}>✏️ Rename pane <span className="context-menu-shortcut">Ctrl+Shift+R</span></button>
            {aiSessionId && (
              <button className="context-menu-item" onClick={() => {
                setPaneMenuPos(null);
                useTerminalStore.getState().showPromptsForTerminal(terminalId);
              }}>💬 Show prompts <span className="context-menu-shortcut">Ctrl+Shift+K</span></button>
            )}
            {aiSessionId && (
              <button className="context-menu-item" onClick={() => {
                setPaneMenuPos(null);
                useTerminalStore.getState().showSessionSummary(aiSessionId);
              }}>📖 Session summary</button>
            )}
            {aiSessionId && (
              <button className="context-menu-item" onClick={() => {
                setPaneMenuPos(null);
                useTerminalStore.getState().showAiSessionsForPane(terminalId);
              }}>✨ Show in AI sessions</button>
            )}
            <div className="context-menu-separator" />
            <button className="context-menu-item" onClick={() => {
              setPaneMenuPos(null);
              const store = useTerminalStore.getState();
              if (paneMode === 'floating') {
                store.moveToTiling(terminalId);
              } else {
                store.moveToFloat(terminalId);
              }
            }}>
              {paneMode === 'floating' ? '↩️ Restore to grid' : '🪟 Float pane'}
              <span className="context-menu-shortcut">Ctrl+Shift+U</span>
            </button>
            <button className="context-menu-item" onClick={() => {
              setPaneMenuPos(null);
              useTerminalStore.getState().detachTerminal(terminalId);
            }}>↗ Detach to window</button>
            {paneCwd && (
              <button className="context-menu-item" onClick={() => {
                setPaneMenuPos(null);
                window.terminalAPI.openPath(paneCwd);
              }} title={paneCwd}>📂 Open folder in explorer</button>
            )}
            <button className="context-menu-item" onClick={() => {
              setPaneMenuPos(null);
              useTerminalStore.getState().moveToDormant(terminalId);
            }}>👁 Hide pane <span className="context-menu-shortcut">Ctrl+Shift+H</span></button>
            <div className="context-menu-separator" />
            <button className="context-menu-item danger" onClick={() => {
              setPaneMenuPos(null);
              useTerminalStore.getState().closeTerminal(terminalId);
            }}>🗑 Close pane <span className="context-menu-shortcut">Ctrl+Shift+W</span></button>
          </div>
        </>,
        document.body,
      )}
      {showDiag && <DiagnosticsOverlay terminalId={terminalId} diagRef={diagRef} mainDiag={mainDiagRef.current} logPath={logPathRef.current} onClose={() => setShowDiag(false)} />}
      <div ref={containerRef} className="xterm-container" />
      {bgTint && <div className="terminal-color-overlay" style={{ background: bgTint + '18' }} />}
      {latestPrompt && (
        <div className="terminal-pane-latest-prompt" title={`${latestPrompt}\n\nClick to jump to this prompt in the buffer`}>
          {aiSessionId && (
            <button
              className={`terminal-pane-status-dot terminal-pane-status-${sessionStatus || 'idle'}`}
              title="Show session status"
              aria-label="Show session status"
              onClick={(e) => {
                e.stopPropagation();
                useTerminalStore.getState().showSessionSummary(aiSessionId);
              }}
            />
          )}
          <span className="terminal-pane-latest-prompt-label">last prompt:</span>
          <span
            className="terminal-pane-latest-prompt-text terminal-pane-latest-prompt-jump"
            onClick={(e) => {
              e.stopPropagation();
              jumpToLatestPrompt();
            }}
          >{latestPrompt}</span>
          {latestPromptTime && (
            <span className="terminal-pane-latest-prompt-time">{relativeTime(latestPromptTime)}</span>
          )}
          <button
            className="terminal-pane-latest-prompt-btn"
            title="Show all prompts (Ctrl+Shift+K)"
            onClick={(e) => {
              e.stopPropagation();
              useTerminalStore.getState().showPromptsForTerminal(terminalId);
            }}
          >⋯</button>
        </div>
      )}
    </div>
  );
};

export default TerminalPanel;
