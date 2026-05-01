---
id: TASK-12
title: Pin AI sessions to top of list
status: Done
assignee: []
created_date: '2026-04-26 11:00'
updated_date: '2026-04-26 11:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pin marker, dedicated Pinned group when grouping by repo. Persists in store.sessionPinned via saveSession. Shipped earlier this session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 📌 marker on session items + click-to-toggle
- [x] #2 Pinned group above all repo groups when groupByRepo is on
- [x] #3 Persists across restarts
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 9c60b70 + ce75464
<!-- SECTION:FINAL_SUMMARY:END -->
