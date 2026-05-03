---
id: TASK-79
title: Improve discoverability of pane multi-select + 'Show Selected' filter
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-03 12:57'
updated_date: '2026-05-03 14:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-72 restored Ctrl+click multi-select on pane title bars and added 'Show Selected Panes' / 'Show All Panes' / 'Clear Pane Selection' to the Command Palette. The user reports the flow isn't very friendly or discoverable - nothing in the UI hints that you can Ctrl+click a pane title, and the only way to trigger the filter is the Command Palette. Want a more obvious affordance. Options: (1) checkbox/toggle on the pane title bar that's always visible in workspaces mode; (2) a 'Filter' or 'Show Selected' button in the workspace tab/toolbar that lights up when a selection exists; (3) onboarding tooltip that explains Ctrl+click the first time the user enters workspaces mode; (4) default keybinding for 'Show Selected' so power users can just hit a key; (5) right-click context-menu entry on the title bar. Pick whichever combination feels least intrusive but most discoverable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From a fresh state, a new user can discover multi-select without reading docs or opening the Command Palette
- [ ] #2 There is a visible affordance for 'Show Selected' that appears when a selection exists
- [ ] #3 Power users still have a fast path (keybinding or palette) - whichever was added does not slow down existing workflow
- [ ] #4 Workspaces mode without any selection has no extra visual clutter introduced by the new affordance
<!-- AC:END -->
