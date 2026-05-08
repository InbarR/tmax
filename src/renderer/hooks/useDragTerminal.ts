import { useState, useCallback } from 'react';
import {
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useTerminalStore } from '../state/terminal-store';
import { getTerminalEntry } from '../terminal-registry';
import type { SplitDirection } from '../state/types';

interface UseDragTerminalResult {
  activeId: string | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
}

export function useDragTerminal(): UseDragTerminalResult {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const terminalId = String(event.active.id);
    setActiveId(terminalId);
    useTerminalStore.getState().setDragging(true, terminalId);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by DropZoneOverlay component
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const store = useTerminalStore.getState();
    const draggedId = String(event.active.id);

    if (event.over) {
      const droppableId = String(event.over.id);
      const parsed = parseDroppableId(droppableId);

      if (!parsed) {
        // Not a drop zone - it's a tab reorder. Workspace tabs use a
        // "workspace:<id>" prefix (TASK-136) so they don't collide with
        // terminal-id sortables that share this DndContext.
        if (draggedId.startsWith('workspace:') && droppableId.startsWith('workspace:')) {
          store.reorderWorkspaces(
            draggedId.slice('workspace:'.length),
            droppableId.slice('workspace:'.length),
          );
        } else {
          store.reorderTerminals(draggedId, droppableId);
        }
      } else if (parsed) {
        const { targetId, side } = parsed;

        if (targetId === 'root') {
          // Root-level drop: wrap entire layout to create full-height/width pane
          const terminal = store.terminals.get(draggedId);
          if (terminal?.mode === 'detached') {
            window.terminalAPI.closeDetached(draggedId);
            store.reattachTerminal(draggedId);
          } else if (terminal?.mode === 'tiled') {
            store.moveToFloat(draggedId);
          } else if (terminal?.mode === 'dormant') {
            store.wakeFromDormant(draggedId);
          }
          store.insertAtRoot(draggedId, side as 'left' | 'right' | 'top' | 'bottom');
        } else if (side === 'center') {
          if (targetId !== draggedId) {
            store.swapTerminals(draggedId, targetId);
          }
        } else if (side === 'float') {
          const terminal = store.terminals.get(draggedId);
          if (terminal && terminal.mode === 'tiled') {
            store.moveToFloat(draggedId);
          }
        } else {
          if (targetId !== draggedId) {
            const directionMap: Record<string, SplitDirection> = {
              left: 'horizontal',
              right: 'horizontal',
              top: 'vertical',
              bottom: 'vertical',
            };
            const direction = directionMap[side];
            if (direction) {
              // Remove dragged from current position and insert at target
              const terminal = store.terminals.get(draggedId);
              if (terminal?.mode === 'detached') {
                // Reattach detached terminal first
                window.terminalAPI.closeDetached(draggedId);
                store.reattachTerminal(draggedId);
              } else if (terminal?.mode === 'tiled') {
                store.moveToFloat(draggedId);
              } else if (terminal?.mode === 'dormant') {
                store.wakeFromDormant(draggedId);
              }
              store.moveToTiling(draggedId, targetId, side as 'left' | 'right' | 'top' | 'bottom');
            }
          }
        }
      }
    }

    setActiveId(null);
    store.setDragging(false);

    // After drop, dnd-kit leaves DOM focus on the drag-activator element (the
    // tab button), so the focused xterm's textarea can't receive keystrokes.
    // Our blur handler's refocus guard sees a non-body activeElement outside
    // the terminal container and bails, leaving the pane "stuck" until a
    // view-mode toggle re-creates the DOM. Explicitly re-focusing xterm here
    // closes that gap.
    requestAnimationFrame(() => {
      const focusedId = useTerminalStore.getState().focusedTerminalId;
      if (!focusedId) return;
      const entry = getTerminalEntry(focusedId);
      try { entry?.terminal.focus(); } catch { /* disposed */ }
    });
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    useTerminalStore.getState().setDragging(false);
    requestAnimationFrame(() => {
      const focusedId = useTerminalStore.getState().focusedTerminalId;
      if (!focusedId) return;
      const entry = getTerminalEntry(focusedId);
      try { entry?.terminal.focus(); } catch { /* disposed */ }
    });
  }, []);

  return {
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    sensors,
  };
}

function parseDroppableId(
  id: string
): { targetId: string; side: string } | null {
  // Format: "drop:{terminalId}:{side}"
  const parts = id.split(':');
  if (parts.length === 3 && parts[0] === 'drop') {
    return { targetId: parts[1], side: parts[2] };
  }
  // Format: "drop:float"
  if (parts.length === 2 && parts[0] === 'drop' && parts[1] === 'float') {
    return { targetId: '', side: 'float' };
  }
  return null;
}
