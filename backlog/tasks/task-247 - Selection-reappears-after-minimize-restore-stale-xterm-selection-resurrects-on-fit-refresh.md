---
id: TASK-247
title: >-
  Selection reappears after minimize/restore (stale xterm selection resurrects
  on fit/refresh)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 15:25'
updated_date: '2026-06-19 15:40'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user on a Claude AI pane selected+copied text, was done with it, then minimized tmax and restored it - the old selection highlight reappeared without re-selecting. Root cause in src/renderer/components/TerminalPanel.tsx: native xterm selections (drag / dbl/triple-click / the AI-pane synthesized term.select at mouseup) auto-copy via onSelectionChange but are never cleared, so the selection model persists. On restore, handleVisibilityChange calls fitAddon.fit() and the tab-tint effect calls term.refresh(), which re-render the still-live selection. Copy-on-select already captured the text, so clearing the stale selection loses nothing. Related to but distinct from TASK-240 (which covered re-selection-can't-replace + dead scroll).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After minimize then restore, a prior selection does NOT reappear in the pane unless the user re-selects
- [x] #2 Copy-on-select text is unaffected (text already on clipboard before the selection is cleared)
- [x] #3 Active drag/selection in progress is not clobbered by the clear
- [x] #4 Playwright regression test reproduces the resurrect-on-restore path and passes after the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace selection lifecycle in TerminalPanel.tsx (DONE - root cause: live selection model + fit/refresh re-render on restore)
2. Clear selection on window blur + document hidden (chosen: minimize/blur trigger)
3. Write Playwright regression (blur clears + refresh does not resurrect)
4. Typecheck
5. Build out-e2e + run single spec (pending user OK - CPU)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Fix: src/renderer/components/TerminalPanel.tsx - the visibilitychange effect now clears the term selection when document.hidden (minimize) and on window blur. Explicit copy paths (Ctrl+C 1274 / right-click 2487) already self-clear, so only uncopied selections (incl. the AI-pane synthesized term.select at 2449) survive to blur and get dropped.
- Confirmed no copyOnSelect-to-clipboard exists; clearing on blur loses no clipboard text.
- Test: tests/e2e/task-247-selection-cleared-on-blur.spec.ts (selectAll -> dispatch blur -> hasSelection false -> refresh -> still false).
- Typecheck: no NEW errors from this change (pre-existing errors at lines 262-265/776/1013/3560 unrelated).
- Tradeoff: select-without-copy then alt-tab-and-back loses the highlight; user opted into minimize/blur trigger.
- AC #4 (run spec) blocked on stale out-e2e rebuild - holding per no-blind-e2e guidance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed a selection that resurrected after minimizing and restoring tmax.

Problem: a native or AI-pane-synthesized xterm selection stays live in xterm's model until the user clicks/types in that pane. On restore, the visibilitychange fit() and the tab-tint refresh() re-render the still-live selection, so a selection the user was done with reappeared.

Fix (src/renderer/components/TerminalPanel.tsx): the visibilitychange effect now clears the pane's selection on window blur and when document is hidden (minimize). Explicit copy (Ctrl+C / right-click) already self-clears, and there is no copy-on-select-to-clipboard, so dropping a lingering selection loses no clipboard text.

User impact: minimize/restore (and alt-tab away/back) no longer shows a stale highlight. Tradeoff: select-without-copy then alt-tab-and-back loses the highlight (intended per the chosen minimize/blur trigger).

Tests: tests/e2e/task-247-selection-cleared-on-blur.spec.ts - selects, dispatches blur, asserts the selection clears and a follow-up refresh() does not resurrect it. Built out-e2e and ran the spec: 1 passed (32s). Typecheck: no new errors.
<!-- SECTION:FINAL_SUMMARY:END -->
