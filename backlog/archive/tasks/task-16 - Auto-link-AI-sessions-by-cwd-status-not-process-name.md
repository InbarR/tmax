---
id: TASK-16
title: Auto-link AI sessions by cwd + status (not process name)
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wrappers like ag.bat, ghcp, npx claude no longer need to be in a hardcoded process-name list. Cwd match + active status is the gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sessions auto-link when status is non-idle and cwd matches
- [x] #2 Existing sessions running elsewhere can attach to a matching pane
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 34451f7 → afb93b4
<!-- SECTION:FINAL_SUMMARY:END -->
