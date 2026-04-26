---
id: TASK-24
title: 'Footer declutter: remove pane name + cwd, move Broadcast to overflow menu'
status: Done
assignee: []
created_date: '2026-04-26 11:12'
updated_date: '2026-04-26 11:12'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The status bar was showing the focused pane title and cwd in the left/center sections, plus a Broadcast button in the right section. This duplicated info already shown on the pane itself and made the footer noisy. Move Broadcast into the overflow popover; keep an inline indicator only when Broadcast is ON. Add Open folder in explorer to the per-pane menu so the cwd shortcut is still reachable. Reorganize the overflow menu with View/Help section labels and a divider.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focused pane name span removed from StatusBar left section
- [x] #2 cwd display button removed from StatusBar center section
- [x] #3 Broadcast added as toggle item in overflow popover with Ctrl+Shift+A shortcut shown
- [x] #4 Inline Broadcast ON pill still visible in right section when active
- [x] #5 Open folder in explorer item appears in per-pane menu when pane has a cwd
- [x] #6 Overflow popover groups items under View / Help labels with a divider between
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Edit StatusBar.tsx: drop focused name + cwd blocks
2. Add Broadcast item + section labels + divider to overflow popover
3. Add Open folder item to TerminalPanel per-pane menu
4. Add CSS for .status-overflow-section-label and .status-overflow-divider
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cleaned up the footer to stop duplicating info that already lives on the focused pane.

Changes:
- Removed focused pane name from StatusBar left section.
- Removed cwd folder button from StatusBar center section.
- Moved Broadcast from a permanent right-section button into the overflow menu, keeping an inline pill only when Broadcast is ON.
- Added Open folder in explorer to the per-pane menu so cwd is still reachable.
- Restructured overflow popover with View / Help section labels and a divider; included Changelog as an explicit menu item.

Rationale:
- User feedback that the footer was crowded and the focused pane already shows title + cwd in its header.
<!-- SECTION:FINAL_SUMMARY:END -->
