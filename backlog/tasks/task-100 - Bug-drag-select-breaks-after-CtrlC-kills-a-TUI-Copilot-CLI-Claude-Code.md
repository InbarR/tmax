---
id: TASK-100
title: 'Bug: drag-select breaks after Ctrl+C kills a TUI (Copilot CLI / Claude Code)'
status: In Progress
assignee:
  - '@inbarr'
created_date: '2026-05-04 12:25'
updated_date: '2026-05-04 12:25'
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
- [ ] #1 After Ctrl+C kills Copilot CLI / Claude Code, drag-select works again immediately in the same terminal
- [ ] #2 TUIs that exit cleanly are unaffected (no double-reset)
- [ ] #3 Mouse modes enabled OUTSIDE alt-screen are NOT reset (we only act on alt-screen exit)
- [ ] #4 Cursor-hide handling for the same alt-screen toggle continues to work
<!-- AC:END -->
