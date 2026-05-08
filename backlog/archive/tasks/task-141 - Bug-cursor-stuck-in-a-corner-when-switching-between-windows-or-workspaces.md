---
id: TASK-141
title: 'Bug: cursor stuck in a corner when switching between windows or workspaces'
status: To Do
assignee: []
created_date: '2026-05-08 08:40'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported in https://github.com/InbarR/tmax/issues/97 by @AsafMah. The xterm cursor visually pins to a corner (top-left or similar) after the user switches windows / workspaces, instead of moving back to where it was on focus return. Likely a cursor-render-position state that doesn't get re-synced on window-show / workspace-activate. Needs repro on the reporter's exact flow before fixing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduce the cursor-pinned-to-corner state in tmax with steps from the issue
- [ ] #2 Identify the focus / workspace-switch event that fails to refresh xterm's cursor render
- [ ] #3 Cursor returns to its true position immediately on window/workspace return
- [ ] #4 Regression spec covers the switch-back flow
<!-- AC:END -->
