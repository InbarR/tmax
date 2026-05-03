---
id: TASK-82
title: 'Focus mode in workspaces: pane switching not discoverable when tabs are hidden'
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-03 13:10'
updated_date: '2026-05-03 14:39'
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
- [x] #2 There is a visible affordance (or auto-revealing one) for pane switching that does not break the full-screen focus aesthetic
- [x] #3 Existing Ctrl+Tab behavior is preserved - power users keep their flow
- [x] #4 Affordance does not appear when there is only one pane in the workspace
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In TilingLayout, walk the tilingRoot to collect leaf terminal IDs.\n2. Render a small floating indicator (row of dots) top-center when viewMode === 'focus' and 2+ panes.\n3. Each dot is a clickable button that calls setFocus.\n4. Subtle styling: 55% opacity at rest, 100% on hover; active pane dot is wider/highlighted; tooltip shows pane title.\n5. Hidden when only 1 pane (no point) or not in focus mode.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-03: Shipped a top-center dot indicator. Each pane gets a dot, focused pane is wider+blue. Hover any dot for tooltip with pane title; click to switch. Hidden when 1 pane or not in focus mode. Tackles AC #2 (visible affordance), #3 (Ctrl+Tab still works), #4 (no clutter when only 1 pane). AC #1 (new user discovers without docs) is partially - dots are visible but tiny; if feedback wants something louder we can add a first-time tooltip later.
<!-- SECTION:NOTES:END -->
