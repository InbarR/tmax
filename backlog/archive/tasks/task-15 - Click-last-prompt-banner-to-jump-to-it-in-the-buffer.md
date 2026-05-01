---
id: TASK-15
title: Click last-prompt banner to jump to it in the buffer
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clicking the prompt text on the per-pane banner runs SearchAddon.findPrevious with progressive prefix shortening (120/60/30/15) and only highlights the active match.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Click on prompt text scrolls to the match
- [x] #2 Only the active match is highlighted (no all-matches wallpaper)
- [x] #3 No misleading 'not in scrollback' toast
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in a0b8dc2 → b9d6bab
<!-- SECTION:FINAL_SUMMARY:END -->
