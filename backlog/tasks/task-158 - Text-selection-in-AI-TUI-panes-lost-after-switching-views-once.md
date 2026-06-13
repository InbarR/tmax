---
id: TASK-158
title: Text selection in AI/TUI panes lost after switching views once
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-06-11 13:51'
updated_date: '2026-06-12 08:25'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Same user report: text selection stops working after changing the view (grid/focus/float) once. Likely tied to the xterm remount on view change and/or mouse-tracking state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting text in a pane still works after toggling view mode
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in TilingLayout.tsx. Root cause confirmed: opening the first split flips the layout root from leaf to split, changing the existing pane's DOM ancestor chain, so React unmounted+remounted its TerminalPanel - recreating xterm and wiping the live selection + mouse-tracking state. Fix: mount each pane's TerminalPanel exactly once into a stable per-terminal host <div.pane-host> via createPortal (PanePortals, rendered at a fixed layout position). Leaf slots (TilingLeaf) imperatively re-parent the host node as the tiling tree reshapes, so xterm is never torn down across splits/un-splits. Added CSS for .pane-host-slot/.pane-host (absolute inset:0 flex). Regression test tests/e2e/task-158-selection-survives-split.spec.ts asserts the xterm instance + DOM node are preserved and the selection survives opening a second pane - passing. Verified the unrelated e2e failures (task-120 drag-copy, workspaces showAllPanes) reproduce on a clean HEAD baseline build, so they are pre-existing, not caused by this change. Also fixes TASK-164 (same regression) and likely TASK-156 (scroll dies after float/re-tile).
<!-- SECTION:NOTES:END -->
