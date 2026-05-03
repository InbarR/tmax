---
id: TASK-89
title: Grid view in flat tab mode hides panes from other workspaces
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 15:23'
updated_date: '2026-05-03 15:23'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inverse of TASK-87. After TASK-87 made the focus->grid toggle scope by activeWorkspaceId, the same filter applies in flat tab mode. But flat tab mode lists ALL panes across all workspaces in the tab bar (TASK-83 fix), so the user expects all 5 (or however many) panes in the grid too. Today they only see the active workspace's panes in the grid, even though the tab bar shows all of them. Fix: only apply the workspace filter when config.tabMode === 'workspaces'. In flat mode, no filter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In flat tab mode, focus->grid shows every pane across every workspace
- [x] #2 In workspaces mode, focus->grid still only shows the active workspace's panes (TASK-87 behavior preserved)
- [x] #3 Tab bar pane count and grid pane count match in both modes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made toggleViewMode read config.tabMode. Filter by activeWorkspaceId only in workspaces mode; in flat mode all tiled terminals flow into the grid. Tab bar count and grid count now agree in both modes.
<!-- SECTION:FINAL_SUMMARY:END -->
