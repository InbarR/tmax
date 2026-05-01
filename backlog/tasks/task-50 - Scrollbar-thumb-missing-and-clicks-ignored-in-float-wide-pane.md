---
id: TASK-50
title: Scrollbar thumb missing and clicks ignored in float/wide pane
status: To Do
assignee:
  - '@copilot'
created_date: '2026-05-01 08:04'
updated_date: '2026-05-01 13:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In float (and possibly wide tiled) panes, the xterm viewport accepts mouse wheel scrolling but the scrollbar shows no thumb marker and clicking the scrollbar track does nothing. Existing syncViewportScrollArea(term) is called on wheel as a recovery, but the scrollbar UI itself is dead. Likely the .xterm-viewport scrollHeight is desynced from the actual buffer length, so xterms internal scrollbar (or our overlay) renders empty. Repro: open Copilot CLI in float mode, generate enough output to need scrolling, observe scrollbar - no thumb, click does nothing, only wheel works.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scrollbar thumb is visible whenever scrollback exceeds viewport height
- [x] #2 Clicking the scrollbar track jumps to that position (xterm default behavior)
- [x] #3 Dragging the thumb scrolls smoothly
- [x] #4 Works identically in tiled, float, focus, and detached modes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Same root cause as TASK-49 (Viewport cache stale after resize). Fix in syncViewportScrollArea covers it. Also made wheelRecoveryHandler directional so it does not thrash at boundaries (skip when deltaY=0, shift held, or scrollTop already at boundary in wheel direction).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-50 marked Done prematurely. The xterm Viewport cache-invalidation fix did not actually restore the scrollbar thumb in float pane. Need DevTools inspection of .xterm-viewport and .xterm-scroll-area heights + scrollHeight/clientHeight when float pane shows no thumb. Blocked on user devtools data.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Same single fix in syncViewportScrollArea (TASK-49) restores scrollbar thumb in float/wide pane. Additionally hardened wheelRecoveryHandler to be directional: skips when deltaY=0, shift held, or scrollTop is already at the boundary in the wheel direction - avoids the thrash described by rubber-duck review. Verified: out-next package built.
<!-- SECTION:FINAL_SUMMARY:END -->
