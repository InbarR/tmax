---
id: TASK-68
title: >-
  Workspaces mode - allow Ctrl+click on panes to multi-select for 'show
  selected' filter (lost when tab headers were replaced)
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-03 07:21'
updated_date: '2026-05-03 07:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In workspaces tab mode the user lost a multi-select interaction that worked with the previous tab-header UI: Ctrl+click on multiple tabs to build a selection, then a 'show selected' action to focus only those panes. Tab headers were replaced (per the workspaces redesign in TASK-40) and the multi-select interaction didn't carry over to the new pane-based UI. Need to restore it: Ctrl+click on a pane (within the workspace grid, presumably in some chrome/title-bar region so it doesn't fight xterm focus) toggles that pane in a multi-selection set. Then a 'Show selected' command (palette / overflow menu / shortcut) hides every pane NOT in the selection. Open questions: where exactly does Ctrl+click bind without breaking xterm or text-selection? What is the visual indicator for selected-but-not-focused panes? What command/shortcut surfaces 'Show selected' / 'Show all'?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In workspaces mode, Ctrl+click (Cmd+click on Mac) on a pane's title bar / chrome adds it to a multi-selection set; visible selection indicator on each selected pane
- [ ] #2 A 'Show selected' command (Command Palette, overflow menu, or shortcut) hides every pane NOT in the selection and is reversible via 'Show all'
- [ ] #3 Multi-select state survives common interactions (typing in another pane, clicking elsewhere) until explicitly cleared - matches the previous tab-header behaviour
- [ ] #4 Cross-platform: Cmd+click on Mac, Ctrl+click on Windows/Linux
- [ ] #5 Playwright spec covers: enter workspaces mode, Ctrl+click two panes, run Show selected, assert only those two are visible, run Show all, assert all visible again
<!-- AC:END -->
