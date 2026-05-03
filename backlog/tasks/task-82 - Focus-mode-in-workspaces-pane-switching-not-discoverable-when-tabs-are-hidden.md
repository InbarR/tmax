---
id: TASK-82
title: 'Focus mode in workspaces: pane switching not discoverable when tabs are hidden'
status: To Do
assignee: []
created_date: '2026-05-03 13:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In workspaces mode, focus mode hides the tab/pane chrome to give the focused pane the full screen. That removes the visible affordance for switching between panes - the only way to navigate is the Ctrl+Tab keyboard shortcut, which the user has to already know about. New users (or users coming from non-workspaces flow) get stuck in focus mode with no UI hint that switching is even possible. Want a discoverable alternative. Options: (1) edge hover - mouse to a screen edge reveals a thin tab strip that auto-hides; (2) always-visible thin indicator (mini tab bar / dots) showing pane count and current position; (3) onboarding tooltip the first time the user enters focus mode in workspaces; (4) Esc-or-similar to bring tabs back temporarily; (5) ensure Ctrl+Tab is in the keybindings.json default set so it shows up in any 'shortcuts' surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From a fresh state, a new user can discover how to switch panes in focus mode without reading docs
- [ ] #2 There is a visible affordance (or auto-revealing one) for pane switching that does not break the full-screen focus aesthetic
- [ ] #3 Existing Ctrl+Tab behavior is preserved - power users keep their flow
- [ ] #4 Affordance does not appear when there is only one pane in the workspace
<!-- AC:END -->
