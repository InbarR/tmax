---
id: TASK-1
title: Tab drag-and-drop reordering
status: Done
assignee: []
created_date: '2026-02-18 21:19'
updated_date: '2026-02-18 21:19'
labels:
  - ui
  - drag-and-drop
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow reordering tabs by dragging them within the tab bar. Reordering tabs also reorders the corresponding terminal panes in the tiling layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tabs use @dnd-kit/sortable instead of useDraggable
- [x] #2 Dragging a tab over another tab reorders both the tab bar and tiling layout panes
- [x] #3 Horizontal and vertical tab bar orientations both supported
- [x] #4 Existing pane split/swap/float drag behavior preserved
- [x] #5 Single tab dragging does nothing
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Switched tab components from useDraggable to useSortable (@dnd-kit/sortable), wrapped in SortableContext with horizontal/vertical strategies. Added reorderTerminals store action that splices the Map entries and reassigns layout tree leaf positions to match. Drop target disambiguation: non-drop: prefixed IDs trigger reorder, drop: prefixed IDs trigger existing split/swap/float logic.

Files changed:
- src/renderer/components/TabBar.tsx — useSortable + SortableContext
- src/renderer/hooks/useDragTerminal.ts — tab reorder branch in handleDragEnd
- src/renderer/state/terminal-store.ts — reorderTerminals action
<!-- SECTION:FINAL_SUMMARY:END -->
