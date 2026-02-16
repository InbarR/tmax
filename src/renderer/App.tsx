import React, { useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import { useTerminalStore } from './state/terminal-store';
import { useKeybindings } from './hooks/useKeybindings';
import { useDragTerminal } from './hooks/useDragTerminal';
import TabBar from './components/TabBar';
import TilingLayout from './components/TilingLayout';
import FloatingLayer from './components/FloatingLayer';
import DropZoneOverlay from './components/DropZoneOverlay';
import TerminalSwitcher from './components/TerminalSwitcher';
import StatusBar from './components/StatusBar';
import ShortcutsHelp from './components/ShortcutsHelp';
import Settings from './components/Settings';
import CommandPalette from './components/CommandPalette';
import DirPanel from './components/DirPanel';

const App: React.FC = () => {
  const loadConfig = useTerminalStore((s) => s.loadConfig);
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const terminals = useTerminalStore((s) => s.terminals);
  const draggedTerminalId = useTerminalStore((s) => s.draggedTerminalId);
  const showShortcuts = useTerminalStore((s) => s.showShortcuts);
  const showCommandPalette = useTerminalStore((s) => s.showCommandPalette);
  const tabBarPosition = useTerminalStore((s) => s.tabBarPosition);

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
        if (cancelled) return;
        if (useTerminalStore.getState().terminals.size === 0) {
          const restored = await useTerminalStore.getState().restoreSession();
          if (cancelled) return;
          if (!restored) {
            await createTerminal();
          }
        }
      } catch (err) {
        console.error('Init failed:', err);
      }
    }
    init();

    // Prevent Chromium CSS zoom on Ctrl+wheel anywhere outside terminals
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
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

    // Listen for detached windows being closed
    const unsubDetached = window.terminalAPI.onDetachedClosed?.((id: string) => {
      useTerminalStore.getState().reattachTerminal(id);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(autoSaveInterval);
      unsubDetached?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className={`app-shell ${tabBarPosition === 'left' ? 'tab-bar-left' : ''}`}>
        <TabBar vertical={tabBarPosition === 'left'} />
        <div className="main-area">
          <DirPanel />
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
        <StatusBar />
        <TerminalSwitcher />
        <CommandPalette />
        <Settings />
        {showShortcuts && (
          <ShortcutsHelp onClose={() => useTerminalStore.getState().toggleShortcuts()} />
        )}
      </div>
    </DndContext>
  );
};

export default App;
