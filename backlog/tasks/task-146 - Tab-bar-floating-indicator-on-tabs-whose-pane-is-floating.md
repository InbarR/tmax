---
id: TASK-146
title: 'Tab bar: floating indicator on tabs whose pane is floating'
status: Done
assignee:
  - '@inrotem'
created_date: '2026-05-09 16:30'
updated_date: '2026-05-09 18:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a terminal is in 'floating' mode, the tab in the bar should visually indicate that. Right now there's no per-tab cue, so users have to mentally track which tabs are floating vs tiled. Add a small icon or accent so floating panes are obvious at a glance from the tab bar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tabs whose terminal mode is 'floating' show a visible indicator (icon, dot, or accent) in the tab bar
- [ ] #2 The indicator updates live when a pane is moved to/from floating
- [ ] #3 Indicator works in both flat tab mode and workspace tab mode
<!-- AC:END -->
