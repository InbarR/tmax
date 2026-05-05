import React, { useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import { useTerminalStore } from './state/terminal-store';
import { getTerminalEntry } from './terminal-registry';
import type { CopilotSessionSummary } from '../shared/copilot-types';
import { useKeybindings } from './hooks/useKeybindings';
import { useDragTerminal } from './hooks/useDragTerminal';
import TabBar from './components/TabBar';
import WorkspaceTabBar from './components/WorkspaceTabBar';
import TilingLayout from './components/TilingLayout';
import FloatingLayer from './components/FloatingLayer';
import DropZoneOverlay from './components/DropZoneOverlay';
import TerminalSwitcher from './components/TerminalSwitcher';
import PromptSearchDialog from './components/PromptSearchDialog';
import PaneHintOverlay from './components/PaneHintOverlay';
import StatusBar from './components/StatusBar';
import ShortcutsHelp from './components/ShortcutsHelp';
import Settings from './components/Settings';
import CommandPalette from './components/CommandPalette';
import DirPanel from './components/DirPanel';
import CopilotPanel from './components/CopilotPanel';
import WorktreePanel from './components/WorktreePanel';
import DiffReview from './components/DiffReview';
import FileExplorer from './components/FileExplorer';
import FloatingRenameInput from './components/FloatingRenameInput';
import Toast from './components/Toast';
import SessionSummary from './components/SessionSummary';
import MarkdownPreviewOverlay from './components/MarkdownPreviewOverlay';
import McpGrantsDialog from './components/McpGrantsDialog';
import AppDialogHost from './components/AppDialog';

const App: React.FC = () => {
  const loadConfig = useTerminalStore((s) => s.loadConfig);
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const terminals = useTerminalStore((s) => s.terminals);
  const draggedTerminalId = useTerminalStore((s) => s.draggedTerminalId);
  const showShortcuts = useTerminalStore((s) => s.showShortcuts);
  const broadcastMode = useTerminalStore((s) => s.broadcastMode);

  // Push pane snapshots to the main process so the cross-pane MCP server's
  // pane registry stays in sync with what the user actually sees in the UI.
  // Default-deny means this metadata is harmless on its own — the server
  // rejects every tool call until the user explicitly grants access.
  //
  // Diff against a ref cache so we only push *changed* panes. Without this,
  // every typed character in any pane (which bumps lastProcess / activity on
  // the terminal map) would re-fire IPC for every pane in the workspace.
  const mcpSnapshotCache = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const api = (window as any).terminalAPI;
    if (!api?.mcpUpdatePane) return;
    const seen = new Set<string>();
    terminals.forEach((t) => {
      seen.add(t.id);
      const snapshot = {
        id: t.id,
        title: t.title,
        cwd: t.cwd,
        lastProcess: t.lastProcess,
        aiSessionId: t.aiSessionId,
        wsl: t.wsl,
        wslDistro: t.wslDistro,
      };
      const key = JSON.stringify(snapshot);
      if (mcpSnapshotCache.current.get(t.id) === key) return;
      mcpSnapshotCache.current.set(t.id, key);
      api.mcpUpdatePane(snapshot);
    });
    // Drop cache entries for panes that no longer exist so they don't leak.
    for (const id of mcpSnapshotCache.current.keys()) {
      if (!seen.has(id)) mcpSnapshotCache.current.delete(id);
    }
  }, [terminals]);

  // Toggle a body class so CSS can add a red outline to all terminal panes
  // while broadcast is on.
  useEffect(() => {
    document.body.classList.toggle('broadcast-on', broadcastMode);
  }, [broadcastMode]);

  // Self-heal grid-mode layouts whenever the terminals map changes. If any
  // code path added a tiled terminal without inserting it into tilingRoot,
  // this catches the orphan on the next tick and rebuilds the grid so all
  // panes render. The action is a no-op when viewMode !== 'grid' or when
  // the tree already matches the map.
  useEffect(() => {
    useTerminalStore.getState().reconcileGridLayout();
  }, [terminals]);
  const showCommandPalette = useTerminalStore((s) => s.showCommandPalette);
  const tabBarPosition = useTerminalStore((s) => s.tabBarPosition);
  const hideTabBar = useTerminalStore((s) => s.hideTabTitles);
  // Pick the tab-bar variant based on config.tabMode (TASK-40).
  const tabMode = useTerminalStore((s) => s.config?.tabMode) ?? 'flat';
  const TopBar = tabMode === 'workspaces' ? WorkspaceTabBar : TabBar;

  useKeybindings();

  const {
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    sensors,
  } = useDragTerminal();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await loadConfig();
        // TASK-117: previously called loadDirs() here, but it issued a
        // separate loadSession() disk read that restoreSession then
        // immediately repeated. Hydration of favoriteDirs/recentDirs now
        // happens inside restoreSession from the same payload.
        // AI session lists must finish before restore so getStartupCommand()
        // can determine the correct agent (copilot vs claude) for each
        // terminal - but they're independent of each other so run in parallel.
        await Promise.all([
          useTerminalStore.getState().loadCopilotSessions(),
          useTerminalStore.getState().loadClaudeCodeSessions(),
        ]);
        if (cancelled) return;
        // Restore FIRST so checkStaleActiveSessions sees persisted overrides
        // and its update gets merged on top rather than being overwritten.
        if (useTerminalStore.getState().terminals.size === 0) {
          await useTerminalStore.getState().restoreSession();
          if (cancelled) return;
        }
        // Always land on a non-empty window - if nothing restored (first run,
        // or user closed all terminals before quitting), auto-spawn a default
        // terminal. Matches Windows Terminal / iTerm / Ghostty behavior.
        if (useTerminalStore.getState().terminals.size === 0) {
          await createTerminal();
        }
        // Check for stale active sessions (>30 days) after hydration
        useTerminalStore.getState().checkStaleActiveSessions();
      } catch (err) {
        console.error('Init failed:', err);
      } finally {
        // TASK-117: always clear the loading flag so a thrown init doesn't
        // leave the loading indicator on screen forever. restoreSession's
        // own finally also clears it; this guards against early throws
        // (loadConfig, AI-session loaders) before restoreSession is reached.
        if (!cancelled) {
          useTerminalStore.setState({ isRestoring: false });
        }
      }
    }
    init();

    (window as any).__terminalStore = useTerminalStore;
    (window as any).__getTerminalEntry = getTerminalEntry;

    // Ctrl+wheel (Cmd+wheel on Mac): zoom the terminal font instead of letting
    // Chromium do its CSS page-zoom. preventDefault MUST happen before the
    // store call or Chromium will scale everything alongside us.
    const handleGlobalWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const store = useTerminalStore.getState();
      if (e.deltaY < 0) store.zoomIn();
      else if (e.deltaY > 0) store.zoomOut();
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

    // In-app toast on status transition to needs-attention.
    // Edge-triggered: only fires when transitioning INTO awaitingApproval /
    // waitingForUser, not on every update. Works for both Copilot and Claude.
    const prevStatus = new Map<string, string>();
    const maybeNotify = (session: CopilotSessionSummary, provider: string) => {
      const prev = prevStatus.get(session.id);
      prevStatus.set(session.id, session.status);
      const attention = session.status === 'awaitingApproval' || session.status === 'waitingForUser';
      const wasAttention = prev === 'awaitingApproval' || prev === 'waitingForUser';
      if (!attention || wasAttention) return;
      const label = session.status === 'awaitingApproval' ? 'needs approval' : 'waiting for input';
      const title = session.summary || session.repository || session.id.slice(0, 8);
      store().addToast(`${provider}: ${title} - ${label}`);
    };

    const unsubCopilotUpdated = api.onCopilotSessionUpdated?.((session: CopilotSessionSummary) => {
      store().updateCopilotSession(session);
      maybeNotify(session, 'Copilot');
    });
    const unsubCopilotAdded = api.onCopilotSessionAdded?.((session: CopilotSessionSummary) => {
      store().addCopilotSession(session);
    });
    const unsubCopilotRemoved = api.onCopilotSessionRemoved?.((sessionId: string) => {
      store().removeCopilotSession(sessionId);
    });
    const unsubClaudeUpdated = api.onClaudeCodeSessionUpdated?.((session: CopilotSessionSummary) => {
      store().updateClaudeCodeSession(session);
      maybeNotify(session, 'Claude');
    });
    const unsubClaudeAdded = api.onClaudeCodeSessionAdded?.((session: CopilotSessionSummary) => {
      store().addClaudeCodeSession(session);
    });
    const unsubClaudeRemoved = api.onClaudeCodeSessionRemoved?.((sessionId: string) => {
      store().removeClaudeCodeSession(sessionId);
    });

    // Hot-reload keybindings when the user edits keybindings.json on disk.
    // The main process watches the file and pushes new bindings here. We
    // patch the in-memory config directly (NOT updateConfig - that would
    // round-trip back to disk and re-fire the watcher in a loop).
    // useKeybindings reads config.keybindings on its next render. (TASK-39)
    const unsubKeybindings = api.onKeybindingsChanged?.((bindings: { key: string; action: string }[]) => {
      const current = store().config;
      if (!current) return;
      useTerminalStore.setState({ config: { ...current, keybindings: bindings } });
      store().addToast('Keybindings reloaded');
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
      unsubKeybindings?.();
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
      onDragCancel={handleDragCancel}
    >
      <div className={`app-shell tab-bar-${tabBarPosition}`}>
        {!hideTabBar && tabBarPosition === 'top' && <TopBar />}
        <div className="content-row">
          {!hideTabBar && tabBarPosition === 'left' && <TopBar vertical />}
          <div className="main-area">
            <DirPanel />
            <CopilotPanel />
            <WorktreePanel />
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
          {!hideTabBar && tabBarPosition === 'right' && <TopBar vertical side="right" />}
        </div>
        {!hideTabBar && tabBarPosition === 'bottom' && <TopBar />}
        <StatusBar />
        <TerminalSwitcher />
        <PromptSearchDialog />
        <PaneHintOverlay />
        <CommandPalette />
        <Settings />
        {showShortcuts && (
          <ShortcutsHelp onClose={() => useTerminalStore.getState().toggleShortcuts()} />
        )}
        <DiffReview />
        <FloatingRenameInput />
        <SessionSummary />
        <MarkdownPreviewOverlay />
        <McpGrantsDialog />
        <Toast />
        <AppDialogHost />
      </div>
    </DndContext>
  );
};

export default App;
