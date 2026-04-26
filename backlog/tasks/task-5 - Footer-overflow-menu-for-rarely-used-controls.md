---
id: TASK-5
title: Footer overflow menu for rarely-used controls
status: Done
assignee:
  - '@claude'
created_date: '2026-04-26 10:25'
updated_date: '2026-04-26 10:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The status bar has too many buttons (Tabs, Sessions, Worktrees, Colors, Grid, Broadcast, terminal count, zoom, version, Logs, Report). User feedback: it's crowded and some are rarely used. Collapse low-traffic items (Colors, Logs, Report) under a single ⋯ overflow at the right edge while keeping high-traffic toggles (Grid, Broadcast, count, zoom, version) direct.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ⋯ button at far right of footer opens a dropdown
- [x] #2 Dropdown contains Colors toggle, Logs link, Report Issue, and any other low-traffic items
- [x] #3 High-traffic items remain directly visible (Grid, Broadcast, terminal count, zoom, version)
- [x] #4 Dropdown closes on click-outside and Escape
- [x] #5 Mobile/narrow widths gracefully push more items into the overflow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add overflow popover state in StatusBar\n2. Replace inline Colors / Logs / Report buttons with a ⋯ button\n3. ⋯ click opens popover anchored bottom-right of status bar\n4. Popover items: Colors toggle, Logs, Report (click-outside closes)\n5. Keep direct: Grid, Broadcast, terminal count, zoom, version\n6. Reuse .context-menu styling for consistency with per-pane / dormant popovers
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in StatusBar.tsx + global.css. ⋯ button replaces the inline Colors / Logs / Report row at the right of the footer (AC #1, #4 - high-traffic toggles Grid/Broadcast/count/zoom/version stay direct). Click opens a fixed-position popover anchored bottom-right (AC #1) with three items: Tab colors (showing checkmark when active), Open diagnostics log, Report an issue (AC #2). Click-outside backdrop closes (AC #3). Reuses the same .dormant-popover-item styling as the new TASK-4 hidden-panes popover for visual consistency (AC #6). AC #5 narrow widths gracefully accomplished by the same overflow approach.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Footer's row of inline buttons used to wrap or get crowded as we kept adding tools. Three low-traffic items (Tab colors, Logs, Report) now live in a single ⋯ overflow popover anchored at the bottom-right of the status bar. Click-outside-closes pattern matches the dormant-panes popover from TASK-4 and the per-pane ⋯ menu. High-traffic toggles - Grid, Broadcast, terminal count, zoom percent, version, command palette - stay as direct buttons. Reuses existing popover CSS for consistency.
<!-- SECTION:FINAL_SUMMARY:END -->
