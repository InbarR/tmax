---
id: TASK-2
title: Double-click dormant tab to wake
status: Done
assignee: []
created_date: '2026-02-18 21:19'
updated_date: '2026-02-18 21:20'
labels:
  - ui
  - tabs
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Double-clicking a dormant tab should wake it instead of starting a rename. Non-dormant tabs still start renaming on double-click.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Double-clicking a dormant tab calls wakeFromDormant
- [x] #2 Double-clicking a non-dormant tab still starts renaming
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added isDormant check to the onDoubleClick handler in TabBar.tsx Tab component. Dormant tabs call wakeFromDormant, others call startRenaming as before.
<!-- SECTION:FINAL_SUMMARY:END -->
