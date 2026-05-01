---
id: TASK-22
title: Click-to-jump scroll auto-recovery + dblclick override
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wheel-event auto-recovery for xterm scroll-area desync. After each wheel, check if scrollTop moved; if not, syncScrollArea on next frame. Dblclick on right edge as manual override.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wheel scroll always works after pane moves / view-mode toggles
- [x] #2 Dblclick on right edge re-syncs the viewport
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 3a90fb0
<!-- SECTION:FINAL_SUMMARY:END -->
