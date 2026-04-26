---
id: TASK-4
title: Wake dormant terminals when tab bar is hidden
status: To Do
assignee: []
created_date: '2026-04-26 10:24'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users can hide the tab bar (Ctrl+Shift+B) for vertical space, but dormant terminals are only accessible by clicking them in the tab bar. With the bar hidden, there's no way to wake them. Add a status-bar indicator like '👁 N hidden ▾' that opens a popup list of dormant panes, each click-to-wake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Status-bar indicator shows count of dormant panes when count > 0
- [ ] #2 Clicking the indicator opens a popup listing dormant panes with their titles
- [ ] #3 Clicking a pane in the popup wakes it via wakeFromDormant
- [ ] #4 Indicator hides itself when no dormant panes exist
- [ ] #5 Works correctly when tab bar is visible too (consistent affordance)
<!-- AC:END -->
