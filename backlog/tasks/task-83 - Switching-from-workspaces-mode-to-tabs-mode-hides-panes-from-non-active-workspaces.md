---
id: TASK-83
title: >-
  Switching from workspaces mode to tabs mode hides panes from non-active
  workspaces
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-05-03 13:10'
updated_date: '2026-05-03 13:20'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user toggles the layout mode from 'workspaces' (tab = collection of panes, TASK-40) back to 'tabs' (flat tab bar with one pane per tab), the flat tab bar only shows the panes that belonged to the currently-active workspace. Panes from OTHER workspaces are invisible in tabs mode - the user can't see or switch to them. Expected: switching to tabs mode flattens ALL panes across ALL workspaces into the tab bar so nothing disappears from view. Likely cause: the tabs-mode renderer iterates the active workspace's tabGroups instead of iterating every pane the store knows about. Fix is probably in the tab bar component's pane-list selector when mode === 'tabs'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Toggling from workspaces mode to tabs mode shows EVERY pane from every workspace in the flat tab bar
- [x] #2 No PTY restarts or pane state loss during the toggle
- [x] #3 Toggling back to workspaces mode restores the per-workspace grouping correctly
- [x] #4 Pane order in tabs mode is stable / predictable (e.g. workspace order then in-workspace order, not arbitrary)
- [x] #5 Cross-platform - works the same on Windows/macOS/Linux
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Flat tab bar (TabBar.tsx) now renders every terminal across every workspace instead of filtering to the active workspace, fixing the regression where panes from non-active workspaces vanished after toggling tabMode workspaces -> flat (TASK-83). Order is stable: workspace insertion order first, then in-workspace creation order. Tabs from a different workspace remain clickable - the onActivate handler now calls setActiveWorkspace(wsId) before setFocus, swapping in that workspace's saved layout so the focused pane is actually visible in the grid. Workspace metadata on each terminal is preserved, so toggling back to workspaces mode restores per-workspace grouping unchanged. No PTY restarts (renderer-only filter/sort + layout swap that already exists from setActiveWorkspace). Single-workspace installs are unaffected.
<!-- SECTION:FINAL_SUMMARY:END -->
