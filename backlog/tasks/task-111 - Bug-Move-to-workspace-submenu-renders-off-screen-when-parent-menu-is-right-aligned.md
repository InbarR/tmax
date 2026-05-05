---
id: TASK-111
title: >-
  Bug: Move to workspace submenu renders off-screen when parent menu is
  right-aligned
status: Done
assignee: []
created_date: '2026-05-04 19:54'
updated_date: '2026-05-04 19:55'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the pane context menu is anchored against the right edge of the viewport (typical for panes on the right side of the grid), clicking 'Move to workspace' positioned the submenu at parentRow.right + 4. The submenu rendered past the right edge of the screen, so the click looked like a no-op even though state updated. Fix flips the submenu to the LEFT side of the trigger row when r.right + 4 + estimatedWidth would overflow window.innerWidth, leaving the right-side anchor for the common case of menus that have room on the right.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking Move to workspace from a right-anchored pane menu opens the submenu inside the viewport
- [x] #2 Submenu still anchors to the right of the trigger row when there is room (left-anchored / centered parent menus)
- [x] #3 Submenu does not get clipped by viewport edge - left position is clamped to >= 4
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TerminalPanel.tsx Move-to-workspace trigger now flips the submenu to the left of the parent menu when the right-side anchor would overflow window.innerWidth.

Changes:
- src/renderer/components/TerminalPanel.tsx:2244 - click handler now picks x = r.right + 4 OR r.left - 4 - SUBMENU_W (clamped to >= 4) based on overflow check.
- src/renderer/components/TerminalPanel.tsx:2320 - render now uses moveToWsSubmenuPos.x directly as `left` (the +4 gap is baked into the click handler's computation).

Assumed submenu width 240px - generous estimate for the longest workspace name in a context menu. Slightly oversizing the estimate is safe (we just flip a touch earlier than strictly needed).
<!-- SECTION:FINAL_SUMMARY:END -->
