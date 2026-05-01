---
id: TASK-18
title: Focus mode wheel-scroll
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hidden leaves under .tiling-focus-mode were eating wheel events. Added pointer-events:none to both .tiling-leaf and .split-container in focus mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wheel-scroll works in focus mode
- [x] #2 Multi-pane focus mode doesn't intercept wheel for the focused leaf
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in ae174a0 + c528266
<!-- SECTION:FINAL_SUMMARY:END -->
