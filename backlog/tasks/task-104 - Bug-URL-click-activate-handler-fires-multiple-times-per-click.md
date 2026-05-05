---
id: TASK-104
title: 'Bug: URL click activate handler fires multiple times per click'
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-04 14:15'
updated_date: '2026-05-04 14:15'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reproduced via DevTools diagnostic that __tmaxLinkActivates increments by 5 per single click on a URL. Each fire calls window.open; Chromium's popup-block heuristic blocks the 2nd-5th, leaving the user with 'first click works, second click does nothing' behavior because their second click is actually click N+1 of a previously-blocked burst. Cause not fully diagnosed - xterm's linkifier appears to invoke activate multiple times for what should be a single click event (possibly related to overlapping link ranges from the soft-wrap + hard-newline stitch when the same URL appears multiple times in the buffer). Fix: dedupe rapid duplicate fires of the same URL within 500ms in the activate handler. Symptomatic but reliable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single click on a URL opens exactly one browser tab
- [x] #2 Rapid double-click on the same URL still opens exactly one tab
- [x] #3 Click URL A, wait 1+ second, click URL B - both open
- [x] #4 Click URL A, wait 1+ second, click URL A again - both clicks open
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
URL provider's activate handler now dedupes rapid duplicate fires of the same URL within 500ms via a window-scoped __tmaxLinkLast {uri, ts} record. Symptomatic fix - root cause of the multi-fire isn't fully diagnosed but the dedupe neutralizes the user-visible failure (Chromium's popup-block kicking in after the first window.open). Different URLs aren't affected; same URL after 500ms is treated as a new click and opens normally.
<!-- SECTION:FINAL_SUMMARY:END -->
