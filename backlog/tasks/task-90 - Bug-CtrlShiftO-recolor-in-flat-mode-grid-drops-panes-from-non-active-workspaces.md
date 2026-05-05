---
id: TASK-90
title: >-
  Bug: Ctrl+Shift+O recolor in flat-mode grid drops panes from non-active
  workspaces
status: Done
assignee: []
created_date: '2026-05-03 15:32'
updated_date: '2026-05-04 13:46'
labels:
  - regression
  - bug
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: workspaces mode with WS1 = 3 panes, WS2 = 2 panes (active = WS2). Switch to flat tab mode -> grid view shows all 5 panes (TASK-89 fix). Press Ctrl+Shift+O (colorizeAllTabs) -> grid drops to 2 panes (only WS2's). Switching back to workspaces mode then shows ALL 5 panes inside WS2 (panes from WS1 got reassigned to WS2). Cause: colorizeAllTabs only mutates tabColor in code, but a downstream re-render or layout recompute is using activeWorkspaceId-scoped logic and rebuilding tilingRoot to only include active-ws panes, while also persisting workspaceId rewrites. Investigate paths triggered by autoColorTabs flag flip and the per-workspace color group iteration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After flat-mode grid shows N panes, Ctrl+Shift+O preserves all N panes in the grid
- [ ] #2 Switching back to workspaces mode after recolor restores the original WS1 / WS2 pane assignment (no migration into active workspace)
- [ ] #3 Tab colors update correctly (toggle off clears, toggle on assigns per-workspace palette)
<!-- AC:END -->
