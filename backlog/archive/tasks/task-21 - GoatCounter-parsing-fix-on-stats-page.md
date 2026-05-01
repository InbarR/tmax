---
id: TASK-21
title: GoatCounter parsing fix on stats page
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
count comes back as a quoted string ('42'), our typeof === 'number' check returned null. Now coerce via Number() with isFinite guard. Also switched Landing Visits to count_unique.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Stats page renders real numbers, not n/a
- [x] #2 Landing Visits uses unique visitors
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 5193ddd → fbc47c2
<!-- SECTION:FINAL_SUMMARY:END -->
