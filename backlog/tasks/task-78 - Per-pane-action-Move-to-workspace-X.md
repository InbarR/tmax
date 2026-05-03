---
id: TASK-78
title: 'Per-pane action: Move to workspace X'
status: To Do
assignee: []
created_date: '2026-05-03 12:57'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today, panes belong to whichever workspace was active when they were created. There is no quick way to relocate an existing pane into a different workspace - the user has to recreate the pane in the target workspace. Want a per-pane action 'Move to workspace ...' that lists existing workspaces (and optionally 'New workspace') so the user can re-home a pane in one click. Surface should match other per-pane actions (overflow menu / right-click on title bar / Command Palette). Open: should the moved pane keep its layout slot in the destination, or land in a default position? What happens when moving the last pane out of a workspace - leave the workspace empty, or auto-remove it?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Per-pane overflow menu has a 'Move to workspace' submenu listing all existing workspaces
- [ ] #2 Selecting a destination workspace removes the pane from the current workspace and adds it to the destination
- [ ] #3 Pane process / cwd / scrollback survive the move (no PTY restart)
- [ ] #4 Command Palette has an equivalent 'Move pane to workspace …' command for the focused pane
- [ ] #5 Cross-platform: works the same on Windows/macOS/Linux
<!-- AC:END -->
