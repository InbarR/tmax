---
id: TASK-4
title: Wake dormant terminals when tab bar is hidden
status: Done
assignee:
  - '@claude'
created_date: '2026-04-26 10:24'
updated_date: '2026-04-26 10:54'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users can hide the tab bar (Ctrl+Shift+B) for vertical space, but dormant terminals are only accessible by clicking them in the tab bar. With the bar hidden, there's no way to wake them. Add a status-bar indicator like '👁 N hidden ▾' that opens a popup list of dormant panes, each click-to-wake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Status-bar indicator shows count of dormant panes when count > 0
- [x] #2 Clicking the indicator opens a popup listing dormant panes with their titles
- [x] #3 Clicking a pane in the popup wakes it via wakeFromDormant
- [x] #4 Indicator hides itself when no dormant panes exist
- [x] #5 Works correctly when tab bar is visible too (consistent affordance)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add selector in StatusBar for terminals with mode='dormant'\n2. Render '👁 N hidden ▾' button in the left status section when count > 0\n3. Click opens a fixed-position popover listing dormant panes (title + cwd subtitle)\n4. Click on item: wakeFromDormant(id) and close popover\n5. Click-outside backdrop closes popover (same pattern as per-pane ⋯ menu)\n6. Always-visible whether tab bar is shown or hidden
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in StatusBar.tsx + global.css. Selector filters terminals by mode='dormant'; indicator button '👁 N hidden ▾' renders only when count > 0 (AC #1, #4); click toggles a popover listing each dormant pane with title + dim cwd subtitle (AC #2); item click calls wakeFromDormant and closes popover (AC #3); button is in the always-visible left section so it works whether the tab bar is shown or hidden (AC #5).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a 'hidden panes' indicator to the status bar. When any pane is dormant (hidden via the per-pane menu), an eye icon with the count appears in the left section between Worktrees and the focused-terminal label. Clicking opens a small popover listing each hidden pane with its title and cwd; clicking an entry wakes that pane via wakeFromDormant. The indicator hides itself when there are no dormant panes. Always-visible whether the tab bar is shown or hidden, which solves the original problem: with Ctrl+Shift+B (hide tab bar) on, dormant panes used to be completely unreachable. Click-outside backdrop closes the popover.
<!-- SECTION:FINAL_SUMMARY:END -->
