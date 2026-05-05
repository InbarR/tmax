---
id: TASK-101
title: 'Bug: tabMode toggle doesn''t rebuild layout for the new pane scope'
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-04 13:27'
updated_date: '2026-05-04 13:27'
labels:
  - bug
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: 2 workspaces (WS1 with 2 tabs, WS2 with 2 tabs). Toggle to flat tab mode. Expected: grid with 4 panes (or some flat layout showing all 4). Actual: same layout as before (only WS1's 2 panes); user has to manually toggle focus->grid to get the 4-pane grid. Then going back to workspaces still shows the 4-pane grid instead of WS1's 2 tabs.\n\nCause: updateConfig({tabMode}) just updates the config flag without touching layout.tilingRoot. The layout was scoped to the previous tabMode's pane set; nothing rebuilds it on the flip.\n\nFix: in updateConfig, detect tabMode change and rebuild appropriately:\n- viewMode='grid': buildGridTree with new mode's pane scope (flat=all, workspaces=active ws)\n- flat->workspaces, non-grid: restore active workspace's saved layout\n- workspaces->flat, non-grid: snapshot leaving workspace's layout, keep current tilingRoot
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Toggling workspaces->flat with grid view rebuilds grid to include ALL panes across workspaces
- [x] #2 Toggling flat->workspaces with grid view rebuilds grid to include only active workspace's panes
- [x] #3 Toggling flat->workspaces with focus view restores the active workspace's saved layout
- [x] #4 Toggling workspaces->flat with focus view doesn't lose the focused pane
- [x] #5 Toggling back and forth doesn't lose any pane state (PTY/cwd/scrollback)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
updateConfig now hooks tabMode flips and rebuilds layout for the new pane scope. In grid view it calls buildGridTree with the right pane set; in non-grid view going to workspaces restores the active workspace's saved layout, going to flat snapshots the leaving workspace first so the trip is reversible. preGridRoot is cleared on the flip since stale references could point at out-of-scope panes.
<!-- SECTION:FINAL_SUMMARY:END -->
