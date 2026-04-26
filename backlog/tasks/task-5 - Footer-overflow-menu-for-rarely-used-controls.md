---
id: TASK-5
title: Footer overflow menu for rarely-used controls
status: To Do
assignee: []
created_date: '2026-04-26 10:25'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The status bar has too many buttons (Tabs, Sessions, Worktrees, Colors, Grid, Broadcast, terminal count, zoom, version, Logs, Report). User feedback: it's crowded and some are rarely used. Collapse low-traffic items (Colors, Logs, Report) under a single ⋯ overflow at the right edge while keeping high-traffic toggles (Grid, Broadcast, count, zoom, version) direct.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ⋯ button at far right of footer opens a dropdown
- [ ] #2 Dropdown contains Colors toggle, Logs link, Report Issue, and any other low-traffic items
- [ ] #3 High-traffic items remain directly visible (Grid, Broadcast, terminal count, zoom, version)
- [ ] #4 Dropdown closes on click-outside and Escape
- [ ] #5 Mobile/narrow widths gracefully push more items into the overflow
<!-- AC:END -->
