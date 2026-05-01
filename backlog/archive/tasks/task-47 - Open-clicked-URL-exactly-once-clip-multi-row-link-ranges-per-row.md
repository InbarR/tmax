---
id: TASK-47
title: Open clicked URL exactly once - clip multi-row link ranges per row
status: Done
assignee:
  - '@inbar'
created_date: '2026-04-30 11:10'
updated_date: '2026-05-01 08:16'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clicking a wrapped URL in the terminal opened it twice (or N times for N visual rows) in the browser. Cause: the custom link provider in TerminalPanel.tsx was returning a link with a multi-row range from EVERY row the URL spanned. xterm registered each as a separate link entry, so a click on the wrapped underline fired activate() once per row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wrapped URLs (soft + hard newline) open exactly once on click
- [ ] #2 Each row's link decoration only covers the URL portion on that row
- [ ] #3 Hovering the URL on any of its rows still shows pointer cursor + underline
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Clipped per-row link ranges in TerminalPanel.tsx link provider (~line 519-525) so each row only emits a link covering its own row. Pre-fix, every row that the URL touched returned a link entry with the FULL multi-row range; xterm registered each as a distinct link record so a single click hit N overlapping records and fired window.open N times. Post-fix, exactly one entry intersects any click position. Verified by new e2e regression test in tests/e2e/issue-62-multiline-links.spec.ts: writes 3-row wrapped URL, mirrors xterm click dispatch, asserts window.open called exactly once with the full URL. The pre-existing #62 test was updated since its assertion (endY > startY) tested the buggy old shape; the user-visible contract is preserved (every wrapped row still detects the full URL).
<!-- SECTION:FINAL_SUMMARY:END -->
