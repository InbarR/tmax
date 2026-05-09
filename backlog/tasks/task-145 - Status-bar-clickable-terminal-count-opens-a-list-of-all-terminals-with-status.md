---
id: TASK-145
title: 'Status bar: clickable terminal count opens a list of all terminals with status'
status: In Progress
assignee:
  - '@inrotem'
created_date: '2026-05-09 16:30'
updated_date: '2026-05-09 16:30'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The status bar shows '2 terminals (1 tiled, 1 floating)' as plain text. Make it clickable to open a popover listing every terminal in the workspace with its title, mode, and AI session status. Click a row to focus that terminal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clicking the terminal-count label in the status bar opens a popover
- [ ] #2 Popover lists every terminal with title, mode (tiled/floating/dormant/detached), and AI session status if any
- [ ] #3 Clicking a row focuses that terminal and closes the popover
- [ ] #4 Popover closes on outside click and on Escape
<!-- AC:END -->
