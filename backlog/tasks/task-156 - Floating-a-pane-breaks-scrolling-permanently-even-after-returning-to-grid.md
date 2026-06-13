---
id: TASK-156
title: Floating a pane breaks scrolling permanently (even after returning to grid)
status: To Do
assignee: []
created_date: '2026-06-11 13:51'
updated_date: '2026-06-13 13:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by a new macOS user post-1.10.0. When a session is opened as a floating pane, scrolling stops working and never recovers, even after switching back to grid view. Page Up/Page Down are the only workaround. Likely the float->tile remount leaves mouse-tracking or the scroll model stuck.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Floating then re-tiling a pane leaves wheel scrolling working
- [ ] #2 Repro covered by a Playwright test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The TASK-158 portal change (panes no longer remount on tiling reshape) very likely fixes this - float->re-tile no longer recreates xterm. Needs verification: float a pane, return to grid, confirm wheel scroll works. NOTE: scroll-after-DETACH is a separate issue (alt-buffer/mouse-tracking, see the new detach-scroll task).
<!-- SECTION:NOTES:END -->
