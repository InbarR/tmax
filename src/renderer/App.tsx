import React, { useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import { useTerminalStore } from './state/terminal-store';
import type { CopilotSessionSummary } from '../shared/copilot-types';
import { useKeybindings } from './hooks/useKeybindings';
import { useDragTerminal } from './hooks/useDragTerminal';
import TabBar from './components/TabBar';
import TilingLayout from './components/TilingLayout';
import FloatingLayer from './components/FloatingLayer';
import DropZoneOverlay from './components/DropZoneOverlay';
import TerminalSwitcher from './components/TerminalSwitcher';
import PaneHintOverlay from './components/PaneHintOverlay';
import StatusBar from './components/StatusBar';
import ShortcutsHelp from './components/ShortcutsHelp';
import Settings from './components/Settings';
import CommandPalette from './components/CommandPalette';
import DirPanel from './components/DirPanel';
import CopilotPanel from './components/CopilotPanel';
import DiffReview from './components/DiffReview';
import FileExplorer from './components/FileExplorer';
import FloatingRenameInput from './components/FloatingRenameInput';
import Toast from './components/Toast';

const App: React.FC = () => {
  const loadConfig = useTerminalStore((s) => s.loadConfig);
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const terminals = useTerminalStore((s) => s.terminals);
  const draggedTerminalId = useTerminalStore((s) => s.draggedTerminalId);
  const showShortcuts = useTerminalStore((s) => s.showShortcuts);
  const showCommandPalette = useTerminalStore((s) => s.showCommandPalette);
  const tabBarPosition = useTerminalStore((s) => s.tabBarPosition);
  const hideTabBar = useTerminalStore((s) => s.hideTabTitles);

  useKeybindings();

  const {
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    sensors,
  } = useDragTerminal();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await loadConfig();
        await useTerminalStore.getState().loadDirs();
        // Load AI session lists before restore so getStartupCommand() can
        // determine the correct agent (copilot vs claude) for each terminal.
        await useTerminalStore.getState().loadCopilotSessions();
        await useTerminalStore.getState().loadClaudeCodeSessions();
        if (cancelled) return;
        if (useTerminalStore.getState().terminals.size === 0) {
          const restored = await useTerminalStore.getState().restoreSession();
          if (cancelled) return;
          if (!restored) {
            await createTerminal();
          }
        } else {
          // Session already active (e.g. hot-reload) — load persisted overrides
          await useTerminalStore.getState().restoreSession();
        }
        // Check for stale active sessions (>30 days) — must run after restoreSession
        // so sessionLifecycleOverrides are loaded before saveSession() is triggered
        useTerminalStore.getState().checkStaleActiveSessions();
      } catch (err) {
        console.error('Init failed:', err);
      }
    }
    init();

    // Prevent Chromium CSS zoom on Ctrl+wheel (Cmd+wheel on Mac) anywhere outside terminals
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });

    // Save session before window closes
    const handleBeforeUnload = () => {
      useTerminalStore.getState().saveSession();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Auto-save session every 5 seconds (crash recovery)
    const autoSaveInterval = setInterval(() => {
      if (useTerminalStore.getState().terminals.size > 0) {
        useTerminalStore.getState().saveSession();
      }
    }, 5000);

    // Renderer heartbeat — logs every 30s so we can detect renderer freezes
    // vs machine sleep in diagnostic logs.
    let heartbeatSeq = 0;
    const heartbeatInterval = setInterval(() => {
      const s = useTerminalStore.getState();
      window.terminalAPI.diagLog('renderer:heartbeat', {
        seq: ++heartbeatSeq,
        terminals: s.terminals.size,
        focused: s.focusedTerminalId ?? 'none',
      });
    }, 30000);

    // Listen for detached windows being closed
    const unsubDetached = window.terminalAPI.onDetachedClosed?.((id: string) => {
      useTerminalStore.getState().reattachTerminal(id);
    });

    // Periodic stale session check (every 6 hours)
    const staleCheckInterval = setInterval(() => {
      useTerminalStore.getState().checkStaleActiveSessions();
    }, 6 * 60 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(autoSaveInterval);
      clearInterval(heartbeatInterval);
      clearInterval(staleCheckInterval);
      unsubDetached?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Always watch AI sessions so tab titles update even when the panel is closed
  useEffect(() => {
    const api = window.terminalAPI as any;
    api.startCopilotWatching?.();
    api.startClaudeCodeWatching?.();

    const store = useTerminalStore.getState;
    const unsubCopilotUpdated = api.onCopilotSessionUpdated?.((session: CopilotSessionSummary) => {
      store().updateCopilotSession(session);
    });
    const unsubCopilotAdded = api.onCopilotSessionAdded?.((session: CopilotSessionSummary) => {
      store().addCopilotSession(session);
    });
    const unsubCopilotRemoved = api.onCopilotSessionRemoved?.((sessionId: string) => {
      store().removeCopilotSession(sessionId);
    });
    const unsubClaudeUpdated = api.onClaudeCodeSessionUpdated?.((session: CopilotSessionSummary) => {
      store().updateClaudeCodeSession(session);
    });
    const unsubClaudeAdded = api.onClaudeCodeSessionAdded?.((session: CopilotSessionSummary) => {
      store().addClaudeCodeSession(session);
    });
    const unsubClaudeRemoved = api.onClaudeCodeSessionRemoved?.((sessionId: string) => {
      store().removeClaudeCodeSession(sessionId);
    });

    return () => {
      api.stopCopilotWatching?.();
      api.stopClaudeCodeWatching?.();
      unsubCopilotUpdated?.();
      unsubCopilotAdded?.();
      unsubCopilotRemoved?.();
      unsubClaudeUpdated?.();
      unsubClaudeAdded?.();
      unsubClaudeRemoved?.();
    };
  }, []);

  const draggedTerminal = draggedTerminalId
    ? terminals.get(draggedTerminalId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={`app-shell tab-bar-${tabBarPosition}`}>
        {!hideTabBar && tabBarPosition === 'top' && <TabBar />}
        <div className="content-row">
          {!hideTabBar && tabBarPosition === 'left' && <TabBar vertical />}
          <div className="main-area">
            <DirPanel />
            <CopilotPanel />
            <FileExplorer />
            <div className="layout-area">
              <TilingLayout />
              <FloatingLayer />
            <DragOverlay>
              {activeId && draggedTerminal ? (
                <div className="drag-overlay-tab">
                  {draggedTerminal.title}
                </div>
              ) : null}
            </DragOverlay>
              <DropZoneOverlay />
            </div>
          </div>
          {!hideTabBar && tabBarPosition === 'right' && <TabBar vertical side="right" />}
        </div>
        {!hideTabBar && tabBarPosition === 'bottom' && <TabBar />}
        <StatusBar />
        <TerminalSwitcher />
        <PaneHintOverlay />
        <CommandPalette />
        <Settings />
        {showShortcuts && (
          <ShortcutsHelp onClose={() => useTerminalStore.getState().toggleShortcuts()} />
        )}
        <DiffReview />
        <FloatingRenameInput />
        <Toast />
      </div>
    </DndContext>
  );
};

export default App;
