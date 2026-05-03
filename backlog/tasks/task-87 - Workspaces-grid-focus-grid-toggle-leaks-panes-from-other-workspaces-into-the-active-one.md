---
id: TASK-87
title: >-
  Workspaces + grid: focus->grid toggle leaks panes from other workspaces into
  the active one
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 14:42'
updated_date: '2026-05-03 14:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In workspaces tab mode, toggling viewMode focus -> grid (Ctrl+Shift+G or Command Palette 'Grid view') builds the grid from EVERY tiled terminal across all workspaces - not just the active workspace's panes. Result: panes the user explicitly created in other workspaces show up in the active workspace's grid, mixing context. Cause: toggleViewMode in terminal-store.ts iterates the full terminals Map without scoping to activeWorkspaceId. Fix: add (t.workspaceId ?? activeWorkspaceId) === activeWorkspaceId to the filter so the grid build sees only the current workspace's tiled panes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In workspaces mode, toggling focus -> grid shows ONLY the active workspace's panes in the grid
- [x] #2 Toggling grid -> focus restores the pre-grid layout for the active workspace (existing preGridRoot path)
- [ ] #3 Switching workspaces while in grid mode rebuilds the grid for the new active workspace
- [x] #4 Flat tab mode behavior unchanged - grid shows all panes (since flat mode has only one workspace anyway)
- [x] #5 No PTY restarts or pane state loss during the toggle
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
toggleViewMode now filters the grid build by active workspace ID. (t.workspaceId ?? activeWsId) === activeWsId guard means only the active workspace's tiled panes flow into buildGridTree; panes belonging to other workspaces stay invisible until the user switches to that workspace. AC #3 (workspace switch while in grid rebuilds for the new workspace) was not addressed in this commit and is left as a follow-up - workaround is to toggle focus<->grid after switching workspaces.
<!-- SECTION:FINAL_SUMMARY:END -->
