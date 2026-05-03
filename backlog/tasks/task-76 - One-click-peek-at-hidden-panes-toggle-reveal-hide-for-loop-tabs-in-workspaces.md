---
id: TASK-76
title: >-
  One-click peek at hidden panes - toggle reveal/hide for loop tabs in
  workspaces
status: To Do
assignee: []
created_date: '2026-05-03 11:44'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User keeps several loop panes (e.g. the first 3 tabs from the left in workspaces mode) hidden most of the time. Today there is no fast way to glance at them - it takes multiple clicks to unhide and then re-hide. Want a one-click 'peek' affordance: click → expand the hidden pane(s) to fill the screen for a quick look; click again → return to the prior hidden state. Should work without changing the saved workspace layout or the user's persistent visibility settings - peek is ephemeral. Open questions: per-pane peek button vs per-workspace 'peek hidden' toggle? Does peek replace the current focused pane, or overlay it? Behavior when there are multiple hidden panes - cycle through, or show all together?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From workspaces mode, one click toggles a hidden pane between 'hidden' and 'fully visible'
- [ ] #2 A second click on the same affordance returns the pane to hidden state
- [ ] #3 Peek is ephemeral - exiting workspace and re-entering does not persist the peek state
- [ ] #4 Saved workspace layout / persistent hide-list is unchanged after peek toggle
- [ ] #5 Cross-platform: works the same on Windows/macOS/Linux
<!-- AC:END -->
