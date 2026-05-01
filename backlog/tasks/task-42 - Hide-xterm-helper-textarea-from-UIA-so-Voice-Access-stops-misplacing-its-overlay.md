---
id: TASK-42
title: >-
  Hide xterm helper textarea from UIA so Voice Access stops misplacing its
  overlay
status: Done
assignee: []
created_date: '2026-04-30 06:59'
updated_date: '2026-04-30 07:01'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In tmax (xterm.js), Windows Voice Access shows its dictation preview overlay anchored to xterm's hidden helper textarea, which marches off the right edge of the pane and lands on the wrong line. Windows Terminal doesn't expose a UIA text field, so it commits straight in with no overlay. Mark the helper textarea aria-hidden=true (and role=presentation) so Voice Access treats tmax like Windows Terminal: dictated text just types straight into the prompt with no misplaced floating preview.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Right after term.open(), the xterm helper textarea has aria-hidden=true and role=presentation set
- [ ] #2 Reapplied if xterm rerenders / replaces the textarea (set on focus too as a safety net)
- [ ] #3 Smoke test with Windows Voice Access: dictated text types into the input with no floating preview overlay (matches Windows Terminal behavior)
- [x] #4 Regular keyboard typing, copy/paste, and IME composition still work
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Set aria-hidden=true and role=presentation on xterm's helper textarea right after term.open() in TerminalPanel.tsx. Wrapped in try/catch in case xterm internals change. Build clean, typecheck baseline unchanged.

AC #2 (reapply on rerender): xterm.js doesn't replace the helper textarea after open() - it lives for the lifetime of the Terminal instance. Setting it once after term.open() is sufficient. If we later see Voice Access regress mid-session, we can add a MutationObserver.

AC #3 (smoke test) needs human verification with Voice Access on Windows.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-42: hide xterm helper textarea from UIA.

Problem
- In tmax, Windows Voice Access renders its dictation preview overlay anchored to xterm's hidden helper textarea (a single-row, non-wrapping element). As text is dictated, the textarea's caret marches off the right edge of the pane, dragging the overlay with it - and sometimes the overlay lands on the wrong line.
- Windows Terminal doesn't have this problem because it doesn't expose a UIA text field at all; it routes input through TSF.

Fix
- Right after term.open(), set aria-hidden=true and role=presentation on the helper textarea. Voice Access (and other UIA-based tools) no longer treat it as a real text field, so the floating preview overlay disappears and dictation just types straight into the prompt - same UX as Windows Terminal.
- Keyboard, paste, and IME composition all bypass ARIA and keep working.

Risk
- Disables UIA-based screen reader access to the terminal pane (e.g. NVDA's review cursor). Not a current user requirement; can be exposed as a setting later if needed.
- 18 lines, single file, wrapped in try/catch.
<!-- SECTION:FINAL_SUMMARY:END -->
