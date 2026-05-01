---
id: TASK-55
title: Sticky session selection across panes
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 13:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-51 made the .selected highlight strong, the .selected class set by onMouseEnter persists after the mouse leaves and competes visually with .pane-active. User reported two rows look equally highlighted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hovering rows does not promote them to .selected
- [ ] #2 .selected (keyboard cursor) is visually subordinate to .pane-active (running pane)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Drop the onMouseEnter setSelectedIndex; demote .selected CSS to a slim left rail + bolder font (no bg fill).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed onMouseEnter setSelectedIndex on .ai-session-item. CSS .ai-session-item.selected now only sets an inset left-rail box-shadow + font-weight:600 on the name; no background fill. .pane-active keeps its bg 0.18 strong highlight, so the running pane is visually distinct from the keyboard cursor.
<!-- SECTION:FINAL_SUMMARY:END -->
