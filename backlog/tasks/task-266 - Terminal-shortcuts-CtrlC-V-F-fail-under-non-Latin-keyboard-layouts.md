---
id: TASK-266
title: Terminal shortcuts (Ctrl+C/V/F) fail under non-Latin keyboard layouts
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-06 07:34'
updated_date: '2026-07-06 07:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the OS keyboard layout is non-Latin (e.g. Hebrew), pressing the physical C/V/F key makes the browser report event.key as the localized character (e.g. Hebrew 'bet' for C) instead of 'c'. TerminalPanel.tsx's custom key handler matches copy/paste/search on event.key === 'c'/'v'/'f', so Ctrl+C never copies (falls through to SIGINT), Ctrl+V never pastes, Ctrl+F never opens search. Reported by user typing in Hebrew layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ctrl+C copies the selection while a non-Latin (Hebrew) keyboard layout is active
- [x] #2 Ctrl+V paste and Ctrl+F search also work under non-Latin layouts
- [x] #3 Fix uses layout-independent event.code (KeyC/KeyV/KeyF) while keeping event.key as fallback; Latin-layout behavior unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Diagnose: event.key is layout-dependent, so Ctrl+C/V/F miss under Hebrew\n2. Add isLetterShortcut(event, letter) to utils/platform.ts using layout-independent event.code\n3. Apply in TerminalPanel.tsx (Ctrl+C, Ctrl+Shift+C, Ctrl+V, Ctrl+F) and DetachedApp.tsx\n4. Add unit tests for Hebrew-layout scenario
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: with a non-Latin OS layout active, browsers set event.key to the localized char (Hebrew bet for physical C), so event.key==='c' never matched and Ctrl+C fell through to SIGINT (same for V/F). Fixed by also matching layout-independent event.code (KeyC/KeyV/KeyF) via new exported helper isLetterShortcut in utils/platform.ts; event.key kept as fallback. Applied in TerminalPanel.tsx and DetachedApp.tsx. Added tests/unit/renderer/task-266-letter-shortcut-layout.test.ts (7 tests, passing).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix terminal Ctrl+C/V/F under non-Latin keyboard layouts.\n\nProblem: with a Hebrew (or other non-Latin) OS layout active, event.key is the localized character, so the terminal key handlers matching event.key==='c'/'v'/'f' never fired — Ctrl+C didn't copy (fell through to SIGINT), Ctrl+V didn't paste, Ctrl+F didn't open search.\n\nFix: added exported helper isLetterShortcut(event, letter) in renderer/utils/platform.ts that also matches the layout-independent event.code ('KeyC' etc.), keeping event.key as a fallback. Wired into TerminalPanel.tsx (Ctrl+C, Ctrl+Shift+C, Ctrl+V, Ctrl+F) and DetachedApp.tsx (Ctrl+C, Ctrl+Shift+C, Ctrl+V). Latin-layout behavior unchanged.\n\nTests: tests/unit/renderer/task-266-letter-shortcut-layout.test.ts (7 passing).
<!-- SECTION:FINAL_SUMMARY:END -->
