import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalStore } from '../state/terminal-store';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  terminalId: string;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ terminalId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
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
        }
      }
    );

    // Handle PTY exit
    const unsubscribePtyExit = window.terminalAPI.onPtyExit(
      (id: string, _exitCode: number | undefined) => {
        if (id === terminalId) {
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        }
      }
    );

    // Send startup command if set (for layout restore)
    const termInstance = useTerminalStore.getState().terminals.get(terminalId);
    if (termInstance?.startupCommand) {
      // Small delay to let shell initialize
      setTimeout(() => {
        window.terminalAPI.writePty(terminalId, termInstance.startupCommand + '\r');
      }, 500);
    }

    // Auto-rename tab when shell sends title via OSC sequence (skip custom titles)
    const titleDisposable = term.onTitleChange((rawTitle) => {
      const store = useTerminalStore.getState();
      const terminal = store.terminals.get(terminalId);

      // Track last process name
      if (terminal && rawTitle) {
        let processName = rawTitle;
        const sep = processName.includes('\\') ? '\\' : '/';
        processName = (processName.split(sep).pop() || processName).replace(/\.(exe|cmd|bat|com)$/i, '');
        const newTerminals = new Map(store.terminals);
        newTerminals.set(terminalId, { ...terminal, lastProcess: processName });
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
      titleDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId, handleFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to fontSize changes from zoom
  useEffect(() => {
    if (terminalRef.current && fitAddonRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        window.terminalAPI.resizePty(terminalId, cols, rows);
      } catch {
        // ignore
      }
    }
  }, [fontSize, terminalId]);

  // Programmatic focus when this terminal becomes focused in the store
  useEffect(() => {
    if (isFocused && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isFocused]);

  const className = `terminal-panel${isFocused ? ' focused' : ''}`;

  return (
    <div className={className} onMouseDown={handleFocus}>
      <div ref={containerRef} className="xterm-container" />
    </div>
  );
};

export default TerminalPanel;
