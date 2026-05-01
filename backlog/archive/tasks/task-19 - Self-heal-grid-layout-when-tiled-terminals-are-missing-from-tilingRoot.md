---
id: TASK-19
title: Self-heal grid layout when tiled terminals are missing from tilingRoot
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: 8 tabs but only 6 panes render. Some path adds to terminals Map without inserting to tilingRoot. Reconcile effect rebuilds grid from Map (source of truth) when count mismatches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All tiled terminals show in grid mode
- [x] #2 Reconcile respects gridSelectedTabs subset scope
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 6097126
<!-- SECTION:FINAL_SUMMARY:END -->
