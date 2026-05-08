---
id: TASK-136
title: 'Feature: drag-reorder workspace tabs (mirror terminal tab drag)'
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-08 07:32'
updated_date: '2026-05-08 08:33'
labels:
  - enhancement
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the terminal tabs (TabBar.tsx) support drag-to-reorder via @dnd-kit/sortable, but the workspace selector tabs at the top (WorkspaceTabBar.tsx) don't. User can't reorder workspaces - they're stuck in creation order. Same UX as terminal tabs would be ideal: grab the tab, drag horizontally, drop, and the workspace list persists in the new order across restarts.\n\nReference impl: TabBar.tsx wraps each tab in useSortable({ id: terminalId }) inside a SortableContext with horizontalListSortingStrategy. The persisted order lives in the terminal store. Workspace order persistence likely needs the same pattern in the workspaces slice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Workspace tabs in WorkspaceTabBar can be drag-reordered horizontally (mouse)
- [x] #2 New order persists across tmax restart
- [x] #3 Drag does not start an accidental tab switch / right-click menu
- [x] #4 + button at end stays in place during drag (not draggable itself)
- [x] #5 Touch / pen input dragging works (or is intentionally not supported - documented either way)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add reorderWorkspaces(activeId, overId) action to terminal-store.ts that uses arrayMove + new Map() with reordered entries.
2. Refactor WorkspaceTabBar.tsx: extract workspace-tab body into a sortable WorkspaceTab subcomponent using useSortable({ id: "workspace:<id>" }).
3. Wrap workspace tabs map in SortableContext with horizontalListSortingStrategy. Use prefixed ids to avoid collision with terminal tab sortables in the shared DndContext.
4. + button stays OUTSIDE SortableContext (already after the .map).
5. Update useDragTerminal.ts handleDragEnd: detect workspace: prefix and route to reorderWorkspaces instead of reorderTerminals.
6. Visual: opacity 0.5 while dragging via useSortable transform/transition (match TabBar). PointerSensor distance:8 already in use - guards against accidental click/menu (AC #3).
7. Persistence: workspaces is a Map; saveSession iterates via .values() so new Map order is auto-persisted (AC #2).
8. Touch/pen: PointerSensor handles pointer events (covers mouse + pen + touch). Document this for AC #5.
9. Typecheck via npx tsc --noEmit (ignore pre-existing errors).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation done in worktree branch worktree-agent-acb4f408d30f30d54.

- Added reorderWorkspaces(draggedId, overId) action to terminal-store.ts: splice + new Map() preserves order; saveSession() persists via Map iteration order.
- Refactored WorkspaceTabBar.tsx into a sortable WorkspaceTab subcomponent using useSortable({ id: "workspace:<id>" }). Namespaced ids avoid collisions with terminal-tab sortables sharing the same DndContext.
- + button stays OUTSIDE the SortableContext.
- Routed onDragEnd in useDragTerminal.ts: workspace: prefix -> reorderWorkspaces, else fall through to reorderTerminals.
- Visual: opacity 0.5 while dragging via transform/transition (matches TabBar).
- Right-click context menu still works: PointerSensor activationConstraint distance:8 prevents drag activation on simple click; right-click does not trigger pointer drag activation.
- Touch/pen: supported via PointerSensor (default sensor handles all pointer types).
- Typecheck: 30 errors (matches baseline; all pre-existing).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Drag-reorder for workspace tabs (mirrors the existing terminal-tab drag pattern).

Changes:
- src/renderer/state/terminal-store.ts: new reorderWorkspaces(draggedId, overId) action. Splice + new Map() preserves order; saveSession persists via Map iteration order so it survives restart.
- src/renderer/components/WorkspaceTabBar.tsx: extracted a WorkspaceTab subcomponent that calls useSortable({ id: "workspace:<id>" }) and applies transform/transition + opacity 0.5 while dragging. The list is wrapped in SortableContext with horizontalListSortingStrategy. The + new-workspace button stays OUTSIDE the SortableContext so it is not draggable.
- src/renderer/hooks/useDragTerminal.ts: handleDragEnd checks for the "workspace:" prefix on dragged + over ids and routes to reorderWorkspaces; otherwise falls through to reorderTerminals as before. Namespacing avoids id collisions with terminal-tab sortables that share the App-level DndContext.

UX:
- PointerSensor activationConstraint { distance: 8 } prevents accidental drag on simple click; right-click context menu and double-click rename still work.
- Touch / pen input dragging is supported automatically because PointerSensor consumes all pointer-event types.

Tests:
- npx tsc --noEmit reports 30 errors, matching the pre-existing baseline (TerminalAPI typings unrelated to this change).
<!-- SECTION:FINAL_SUMMARY:END -->
