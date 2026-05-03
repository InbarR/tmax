---
id: TASK-80
title: >-
  AI sessions panel: surface Refresh, demote Group to overflow menu (swap their
  positions)
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-05-03 13:00'
updated_date: '2026-05-03 14:07'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User feedback (translated from Hebrew, with screenshot): currently the AI Sessions panel header shows 'Group' as a visible button, with Refresh hidden inside the overflow (...) menu alongside 'Show running only' and 'Cleanup sessions...'. The user argues Refresh deserves the prime spot since it's a one-shot action used often, while Group is closer to a filter (like 'Show running only' which already lives in the overflow). Swap them: Refresh becomes a visible header button; Group moves into the overflow menu, ideally next to or above 'Show running only' since both shape what the list shows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Refresh button is visible directly in the AI sessions panel header (no overflow click required)
- [x] #2 Group control is moved INTO the panel header overflow menu, alongside 'Running only' / cleanup controls
- [x] #3 Refresh continues to behave the same - one click triggers a session list refresh
- [x] #4 Group still works the same when invoked from the overflow menu - just one extra click to open the menu
- [x] #5 No regression to keyboard navigation / accessibility of either control
- [x] #6 AI Sessions panel header has Refresh as a visible button (no overflow click required)
- [x] #7 Group control moves INTO the overflow menu, grouped with the other view-shaping items ('Show running only', 'Cleanup sessions...')
- [x] #8 Refresh continues to behave the same - one click triggers a session list refresh
- [x] #9 Group still works the same when invoked from the overflow menu
- [x] #10 No regression to keyboard navigation / accessibility of either control
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in commit cd29b97. CopilotPanel.tsx header swaps Refresh and Group: Refresh is now a visible icon button (12x12 SVG), Group moves into the overflow menu next to 'Show running only'.
<!-- SECTION:FINAL_SUMMARY:END -->
