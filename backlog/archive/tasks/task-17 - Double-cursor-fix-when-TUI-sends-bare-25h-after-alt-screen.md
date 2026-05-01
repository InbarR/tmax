---
id: TASK-17
title: Double-cursor fix when TUI sends bare ?25h after alt-screen
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Earlier alt-screen + bracketed-paste fix only re-hid the cursor when ?2004/?1049 appeared in the chunk. Bare ?25h slipped through. Now we re-hide when either signal is on, regardless of what triggered the chunk. Playwright regression added.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 isCursorHidden stays true through ?1049h ?2004h then bare ?25h
- [x] #2 Playwright test asserts the above
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 9809aa9
<!-- SECTION:FINAL_SUMMARY:END -->
