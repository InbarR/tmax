---
id: TASK-256
title: 'Command palette: show live result count'
status: Done
assignee: []
created_date: '2026-06-21 17:48'
updated_date: '2026-06-21 17:49'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The command palette doesn't show how many commands match. Add a small live count that updates as you type/filter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Palette shows a result count that updates with the filter query
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a live result count to the command palette (between the input and the list). Shows '<n> results' (singular '1 result'), updates as the filter query changes. CommandPalette.tsx + .palette-count style in global.css.
<!-- SECTION:FINAL_SUMMARY:END -->
