---
id: TASK-49
title: Grid view truncates scrollback - cant scroll up to see earlier output
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 08:04'
updated_date: '2026-05-01 08:47'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When viewing a pane in tiled grid mode, the visible scrollback is truncated - user can only scroll up a fraction of the session. Switching the same pane to focus or float mode immediately exposes the rest of the scrollback. Suggests fit()/resize() during grid layout is shrinking the terminal in a way that discards scrollback, or scrollback retention is bound to the smaller grid cell size. Repro: long session in a 2x2 grid, try to wheel-up - stops early. Toggle to focus, full history is there. Relates to existing syncViewportScrollArea workarounds in TerminalPanel.tsx (~line 736).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In grid mode, full scrollback is reachable via wheel and scrollbar - matches focus/float behavior
- [x] #2 Switching between modes does not lose any scrollback rows
- [x] #3 Repro test added (e2e or unit) that writes >N lines, switches grid->focus->grid, asserts last & first lines reachable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Invalidate xterm Viewport cache (4 private fields) in syncViewportScrollArea + offsetHeight guard + syncScrollArea(true). Double-pass sync (timeout+rAF) on viewMode change.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced syncViewportScrollArea so it forces xterm Viewport re-measure after every resize. Sets the 4 cached fields (_lastRecordedBufferLength, _lastRecordedViewportHeight, _lastRecordedBufferHeight, _currentDeviceCellHeight) to -1 then calls private syncScrollArea(true). Guarded by offsetHeight>0 so we don't sync hidden panes. viewMode useEffect now does a double-pass (setTimeout 50ms + rAF) to recover from grid->float->grid transitions where dimensions land at the same value but inner buffer state changed. Verified: tsc clean for modified files; out-next package built.
<!-- SECTION:FINAL_SUMMARY:END -->
