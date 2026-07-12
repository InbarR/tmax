---
id: TASK-271
title: Window restores on wrong monitor after minimize
status: Done
assignee: []
created_date: '2026-07-11 15:28'
updated_date: '2026-07-12 10:52'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On multi-monitor setups, minimizing tmax on the left monitor and then restoring (clicking taskbar or global hotkey) sometimes moves the window to the right/primary monitor. TASK-171 fixed the initial launch placement but the restore path (mainWindow.restore()) doesn't verify the display. The persist handler may also save bad bounds during minimize (Windows reports -32000,-32000 for minimized windows via the move event).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 persistWindowState skips saving when window is minimized
- [x] #2 restore() keeps window on the same monitor it was minimized from
- [x] #3 Global hotkey restore lands on the correct monitor
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two-layer fix for multi-monitor restore:

1. persistWindowState: skip saving when minimized (isMinimized guard + x/y <= -30000 sanity check). Shipped in 2ac4b89.
2. Continuous display tracking via move/resize/maximize events. On restore from minimize, checks if Windows placed the window on the wrong monitor and moves it back (with re-maximize if needed). Uses 100ms delay for Windows to settle bounds. Shipped in fb4487e.
<!-- SECTION:FINAL_SUMMARY:END -->
