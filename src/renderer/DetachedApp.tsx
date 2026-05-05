import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { isMac } from './utils/platform';
import { prepareClipboardPaste, resolveClipboardPaste } from './utils/paste';
import '@xterm/xterm/css/xterm.css';

function hexToTerminalRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

interface DetachedAppProps {
  terminalId: string;
}

const DetachedApp: React.FC<DetachedAppProps> = ({ terminalId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      const config = await window.terminalAPI.getConfig();
      const themeConfig = config?.theme as Record<string, string> | undefined;
      const termConfig = config?.terminal as Record<string, unknown> | undefined;

      const materialActive = (config as any)?.backgroundMaterial && (config as any).backgroundMaterial !== 'none';
      const bgOpacity = materialActive ? ((config as any)?.backgroundOpacity ?? 0.8) : 1;
      const rawBg = themeConfig?.background ?? '#1e1e2e';
      const bgColor = bgOpacity < 1 ? hexToTerminalRgba(rawBg, bgOpacity) : rawBg;

      // Add transparency class so CSS layers become translucent
      if (materialActive) {
        document.documentElement.classList.add('transparency-active');
        document.body.style.background = 'transparent';
      }

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
        fontSize: (termConfig?.fontSize as number) ?? 14,
        fontFamily:
          (termConfig?.fontFamily as string) ??
          "'CaskaydiaCove Nerd Font', 'Cascadia Code', 'Consolas', monospace",
        scrollback: (termConfig?.scrollback as number) ?? 5000,
        cursorStyle: (termConfig?.cursorStyle as 'block') ?? 'block',
        cursorBlink: (termConfig?.cursorBlink as boolean) ?? true,
        cursorInactiveStyle: 'none',
        allowTransparency: bgOpacity < 1,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      // Custom URL regex: include | (pipe) in URLs (xterm.js default excludes it)
      const urlRegex = /(https?|HTTPS?):[/]{2}[^\s"'!*(){}\\\^<>`]*[^\s"':,.!?{}\\\^~\[\]`()<>]/;
      term.loadAddon(new WebLinksAddon(undefined, { urlRegex }));

      // Clipboard paste/copy handling
      const pasteToPty = (text: string) => {
        const payload = prepareClipboardPaste(text, !!term.modes.bracketedPasteMode);
        window.terminalAPI.writePty(terminalId, payload);
      };
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') return true;
        if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')) {
          const decision = resolveClipboardPaste({
            hasImage: window.terminalAPI.clipboardHasImage(),
            html: window.terminalAPI.clipboardReadHTML(),
            plainText: window.terminalAPI.clipboardRead(),
          });
          if (decision.kind === 'image') {
            window.terminalAPI.clipboardSaveImage().then((filePath) => {
              pasteToPty(filePath);
            });
          } else if (decision.kind === 'text') {
            pasteToPty(decision.text);
          }
          return false;
        }
        if ((isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && event.key === 'c' && term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
          return false;
        }
        if ((isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && event.key === 'C') {
          const sel = term.getSelection();
          if (sel) navigator.clipboard.writeText(sel);
          return false;
        }
        return true;
      });

      term.open(containerRef.current!);
      requestAnimationFrame(() => fitAddon.fit());

      const dataDisposable = term.onData((data) => {
        window.terminalAPI.writePty(terminalId, data);
      });

      let mouseTrackingOn = false;
      const unsubscribePtyData = window.terminalAPI.onPtyData((id, data) => {
        if (id !== terminalId) return;
        // Track mouse reporting modes so handleContextMenu can suppress paste
        for (let i = 0; i < data.length; i++) {
          if (data.charCodeAt(i) !== 0x1b) continue;
          if (data.startsWith('\x1b[?1000h', i) || data.startsWith('\x1b[?1002h', i) ||
              data.startsWith('\x1b[?1003h', i)) {
            mouseTrackingOn = true;
          } else if (data.startsWith('\x1b[?1000l', i) || data.startsWith('\x1b[?1002l', i) ||
                     data.startsWith('\x1b[?1003l', i)) {
            mouseTrackingOn = false;
          }
        }
        term.write(data);
      });

      const unsubscribePtyExit = window.terminalAPI.onPtyExit((id) => {
        if (id === terminalId) {
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        }
      });

      const titleDisposable = term.onTitleChange((title) => {
        document.title = `tmax - ${title}`;
      });

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          window.terminalAPI.resizePty(terminalId, term.cols, term.rows);
        } catch {}
      });
      resizeObserver.observe(containerRef.current!);

      // Right-click: copy if selection, paste otherwise. Mirrors
      // TerminalPanel so detached windows match main window behaviour.
      // Skip the implicit paste when clipboard is image-only (issue #84) -
      // see TerminalPanel.handleContextMenu for the rationale.

      // Track left-button drags. With mouse reporting on the TUI swallows
      // the drag and xterm has no native selection - so we snapshot the text
      // under the drag rectangle from the buffer for the right-click handler
      // to copy (TASK-120). Mirrors TerminalPanel.
      let pendingTuiCopyText: string | null = null;
      let pendingTuiCopyClearTimer: ReturnType<typeof setTimeout> | null = null;
      let dragStartPos: { x: number; y: number } | null = null;
      let rightClickInFlight = false;
      const DRAG_THRESHOLD = 5;

      const clearPendingTuiCopy = () => {
        pendingTuiCopyText = null;
        if (pendingTuiCopyClearTimer) {
          clearTimeout(pendingTuiCopyClearTimer);
          pendingTuiCopyClearTimer = null;
        }
      };

      const pixelToCell = (clientX: number, clientY: number): { col: number; row: number } | null => {
        const screen = containerRef.current?.querySelector('.xterm-screen') as HTMLElement | null;
        if (!screen) return null;
        const rect = screen.getBoundingClientRect();
        const dim = (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } }; actualCellWidth?: number; actualCellHeight?: number } } } })._core?._renderService?.dimensions;
        const cellW = dim?.css?.cell?.width ?? dim?.actualCellWidth ?? 0;
        const cellH = dim?.css?.cell?.height ?? dim?.actualCellHeight ?? 0;
        if (!cellW || !cellH) return null;
        const viewportCol = Math.max(0, Math.min(term.cols - 1, Math.floor((clientX - rect.left) / cellW)));
        const viewportRow = Math.max(0, Math.min(term.rows - 1, Math.floor((clientY - rect.top) / cellH)));
        return { col: viewportCol, row: viewportRow + term.buffer.active.viewportY };
      };

      const readBufferRange = (start: { col: number; row: number }, end: { col: number; row: number }): string => {
        let s = start;
        let e = end;
        if (s.row > e.row || (s.row === e.row && s.col > e.col)) {
          const tmp = s; s = e; e = tmp;
        }
        const buf = term.buffer.active;
        if (s.row === e.row) {
          return buf.getLine(s.row)?.translateToString(true, s.col, e.col) ?? '';
        }
        const parts: string[] = [];
        parts.push(buf.getLine(s.row)?.translateToString(true, s.col) ?? '');
        for (let r = s.row + 1; r < e.row; r++) {
          parts.push(buf.getLine(r)?.translateToString(true) ?? '');
        }
        parts.push(buf.getLine(e.row)?.translateToString(true, 0, e.col) ?? '');
        return parts.join('\n');
      };

      const handleLeftMouseDown = (e: MouseEvent) => {
        if (e.button === 0) {
          dragStartPos = { x: e.clientX, y: e.clientY };
        }
      };
      const handleLeftMouseUp = (e: MouseEvent) => {
        if (e.button === 0 && dragStartPos) {
          const dx = e.clientX - dragStartPos.x;
          const dy = e.clientY - dragStartPos.y;
          const wasDrag = Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD;
          // Native xterm selections covered by onSelectionChange below; this
          // handler only catches the TUI mouse-reporting case where xterm
          // never sees a selection.
          if (wasDrag && mouseTrackingOn && !term.hasSelection()) {
            const startCell = pixelToCell(dragStartPos.x, dragStartPos.y);
            const endCell = pixelToCell(e.clientX, e.clientY);
            if (startCell && endCell) {
              const snapshot = readBufferRange(startCell, endCell).replace(/\s+$/u, '');
              if (snapshot) {
                pendingTuiCopyText = snapshot;
                if (pendingTuiCopyClearTimer) clearTimeout(pendingTuiCopyClearTimer);
                pendingTuiCopyClearTimer = setTimeout(clearPendingTuiCopy, 3000);
              }
            }
          }
          dragStartPos = null;
        }
      };

      let lastCopyAt = 0;
      const POST_COPY_PASTE_GUARD_MS = 600;
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        rightClickInFlight = false;
        if (term.hasSelection()) {
          window.terminalAPI.clipboardWrite(term.getSelection());
          term.clearSelection();
          clearPendingTuiCopy();
          lastCopyAt = Date.now();
          return;
        }
        // Mouse reporting consumed a drag - copy the captured buffer text.
        if (pendingTuiCopyText) {
          const text = pendingTuiCopyText;
          clearPendingTuiCopy();
          window.terminalAPI.clipboardWrite(text);
          lastCopyAt = Date.now();
          return;
        }
        // Guard against a quick second right-click pasting the just-copied text.
        if (Date.now() - lastCopyAt < POST_COPY_PASTE_GUARD_MS) {
          return;
        }
        const hasImage = window.terminalAPI.clipboardHasImage();
        const html = window.terminalAPI.clipboardReadHTML();
        const plainText = window.terminalAPI.clipboardRead();
        if (hasImage && !plainText && !html) return;
        const decision = resolveClipboardPaste({ hasImage, html, plainText });
        if (decision.kind === 'image') {
          window.terminalAPI.clipboardSaveImage().then((filePath: string) => {
            window.terminalAPI.writePty(terminalId, filePath);
          });
        } else if (decision.kind === 'text') {
          pasteToPty(decision.text);
        }
      };
      // Block right-button mousedown/mouseup in capture so xterm.js can't
      // forward SGR mouse events to the pty. Otherwise a TUI with mouse
      // reporting on would see the right-click on top of our paste and the
      // user would see a double paste (issue #72 variant).
      //
      // Also snapshot the active selection on right-button mousedown - this
      // covers double-click word selection and triple-click line selection,
      // which don't go through our left-mouse drag logic and can be cleared
      // by the right-click mousedown before contextmenu fires.
      const handleRightMouseButton = (e: MouseEvent) => {
        if (e.button === 2) {
          if (e.type === 'mousedown') {
            rightClickInFlight = true;
            if (term.hasSelection()) {
              const sel = term.getSelection().replace(/\s+$/u, '');
              if (sel) {
                pendingTuiCopyText = sel;
                if (pendingTuiCopyClearTimer) clearTimeout(pendingTuiCopyClearTimer);
                pendingTuiCopyClearTimer = setTimeout(clearPendingTuiCopy, 3000);
              }
            }
          }
          e.preventDefault();
          e.stopPropagation();
        }
      };
      const containerEl = containerRef.current!;
      containerEl.addEventListener('contextmenu', handleContextMenu, true);
      containerEl.addEventListener('mousedown', handleRightMouseButton, true);
      containerEl.addEventListener('mouseup', handleRightMouseButton, true);
      containerEl.addEventListener('mousedown', handleLeftMouseDown, true);
      containerEl.addEventListener('mouseup', handleLeftMouseUp, true);

      // Mirror native xterm selections into pendingTuiCopyText (drag, double-
      // click word, triple-click line, term.select API). Skip the empty-
      // selection clear during a right-click so xterm clearing the selection
      // mid-right-click can't wipe our just-captured snapshot.
      const selectionDisposable = term.onSelectionChange(() => {
        if (term.hasSelection()) {
          const sel = term.getSelection().replace(/\s+$/u, '');
          if (sel) {
            pendingTuiCopyText = sel;
            if (pendingTuiCopyClearTimer) clearTimeout(pendingTuiCopyClearTimer);
            pendingTuiCopyClearTimer = setTimeout(clearPendingTuiCopy, 3000);
          }
        } else if (pendingTuiCopyText && !rightClickInFlight) {
          clearPendingTuiCopy();
        }
      });

      term.focus();

      cleanup = () => {
        resizeObserver.disconnect();
        dataDisposable.dispose();
        unsubscribePtyData();
        unsubscribePtyExit();
        titleDisposable.dispose();
        containerEl.removeEventListener('contextmenu', handleContextMenu, true);
        containerEl.removeEventListener('mousedown', handleRightMouseButton, true);
        containerEl.removeEventListener('mouseup', handleRightMouseButton, true);
        containerEl.removeEventListener('mousedown', handleLeftMouseDown, true);
        containerEl.removeEventListener('mouseup', handleLeftMouseUp, true);
        selectionDisposable.dispose();
        term.dispose();
      };
    })();

    return () => cleanup?.();
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#1e1e2e',
      }}
    />
  );
};

export default DetachedApp;
