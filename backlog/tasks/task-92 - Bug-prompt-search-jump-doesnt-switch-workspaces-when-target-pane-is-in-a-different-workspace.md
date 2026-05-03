---
id: TASK-92
title: >-
  Bug: prompt search jump doesn't switch workspaces when target pane is in a
  different workspace
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 15:33'
updated_date: '2026-05-03 15:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the Ctrl+Shift+Y prompt search, clicking a result whose linked pane lives in a different workspace from the currently active one calls setFocus(terminalId) but doesn't call setActiveWorkspace - so the focused terminal id changes underneath but the user still sees the active workspace's panes. They have to manually switch workspaces to see the pane they jumped to.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Click a search result whose pane is in a different workspace -> active workspace switches AND that pane gets focus
- [x] #2 Click a result whose pane is in the same workspace -> behavior unchanged (just focus, no workspace switch)
- [x] #3 Pre-grid layout / preGridRoot of both source and destination workspaces is preserved correctly across the switch
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PromptSearchDialog.jumpTo now reads the target terminal's workspaceId and calls setActiveWorkspace before setFocus when the pane lives in a different workspace. Same-workspace path is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
