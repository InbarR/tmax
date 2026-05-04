---
id: TASK-100
title: 'Bug: drag-select breaks after Ctrl+C kills a TUI (Copilot CLI / Claude Code)'
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-04 12:25'
updated_date: '2026-05-04 13:49'
labels:
  - bug
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro from user: open a fresh terminal, run copilot, exit it with Ctrl+C, return to the shell prompt. Mouse drag no longer selects text - clicks register but selection rectangle never appears. Cause: TUIs enable xterm mouse tracking modes when they start (\x1b[?1000h / ?1002h / ?1006h). On graceful exit they send the matching reset; on Ctrl+C kill they die before the reset reaches xterm. xterm keeps forwarding mouse events to the (now-dead) PTY instead of doing local selection. Fix: hook the existing alt-screen toggle tracking - when we see \x1b[?1049l (alt-screen exit) AND any mouse mode is currently active, force-write the mouse-mode reset sequences to xterm so it stops forwarding events. Implementation lives next to the existing cursor-visibility sync in TerminalPanel.tsx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After Ctrl+C kills Copilot CLI / Claude Code, drag-select works again immediately in the same terminal
- [x] #2 TUIs that exit cleanly are unaffected (no double-reset)
- [x] #3 Mouse modes enabled OUTSIDE alt-screen are NOT reset (we only act on alt-screen exit)
- [x] #4 Cursor-hide handling for the same alt-screen toggle continues to work
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in commit bfe8527. TerminalPanel.tsx now tracks any active mouse-tracking mode (?1000h/?1002h/?1003h/?1006h/?1015h) alongside the existing alt-screen toggle. On alt-screen exit (?1049l/?1047l) with mouse modes still active, force-writes the matching reset sequences to xterm so it stops forwarding mouse events to the (now-dead) child process and drag-select works again. Spec at tests/e2e/task-100-mouse-mode-reset-on-altscreen-exit.spec.ts covers leftover-reset, no-double-reset, and no-touch-without-altscreen cases.
<!-- SECTION:FINAL_SUMMARY:END -->
