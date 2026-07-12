---
id: TASK-268
title: Bulletproof scroll wheel handler (3-path rewrite)
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-11 15:27'
updated_date: '2026-07-11 15:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrote the custom wheel event handler in TerminalPanel.tsx to fix scroll dying in long sessions. Root cause: xterm.js divides deltaY by _currentRowHeight which goes stale (0) after viewport reset, silently dropping wheel events. The new handler bypasses xterm entirely with 3 paths: (A) TUI+mouse tracking -> direct PTY mouse reports, (B) alt buffer without tracking (less/vim) -> synthesized arrow keys, (C) normal buffer -> scrollLines(). Also adds fractional pixel accumulator for trackpad, deltaMode normalization, and burst capping. Pushed as c1a7353. Fixes #130.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scroll works in TUI panes (Copilot CLI, Claude Code) after long sessions
- [x] #2 Scroll works in pagers (less, vim) on alternate buffer
- [x] #3 Trackpad smooth scrolling works on macOS
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote wheel handler in TerminalPanel.tsx with 3 clear paths bypassing xterm's broken getLinesScrolled(). Added fractional accumulator, deltaMode handling, burst cap. Pushed as c1a7353, fixes #130.
<!-- SECTION:FINAL_SUMMARY:END -->
