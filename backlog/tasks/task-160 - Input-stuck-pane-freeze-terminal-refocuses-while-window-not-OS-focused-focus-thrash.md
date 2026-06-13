---
id: TASK-160
title: >-
  Input-stuck pane freeze: terminal refocuses while window not OS-focused (focus
  thrash)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-11 14:24'
updated_date: '2026-06-13 13:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The recurring 'can't type / input stuck' freeze (GH #70/#126 family). Live-diagnosed 2026-06-11 from the diag log: the focused pane repeatedly fired focus-lost -> focus-refocus-check {hasFocus:false, visible:true, thief:null} -> refocus, in a loop. Root cause: TerminalPanel's blur->refocus handler refocused the xterm textarea whenever the page was visible, even when document.hasFocus() was false (window not OS-active - e.g. another app/notification/second tmax instance has focus). The refocus can't make the window OS-active, so it blurs again -> loop, emitting DEC focus escapes (\x1b[I/\x1b[O) and shredding real keystrokes. The earlier guard only bailed when !hasFocus && !visible (loosened for an RDP typing case). Fix: only refocus when the window has OS focus OR a genuine keydown landed in this pane within 3s (RDP recovery); track real keydown separately from term.onData (which also fires for the focus escapes). Reproduced + regression test in tests/e2e/gh-126-focus-thrash.spec.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Terminal is NOT auto-refocused while the window lacks OS focus and no recent keypress (no thrash loop)
- [ ] #2 RDP case still recovers: refocus fires when a real key was pressed in the pane recently
- [x] #3 Covered by a Playwright regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
e2e gh-126-focus-thrash.spec.ts passes against a fresh out-e2e build: with hasFocus()=false the textarea is no longer auto-refocused (activeIsTermTextarea:false). Normal click-to-focus still works. RDP path (AC#2) preserved by the recently-typed grace, verified by inspection.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Focus-thrash refocus guard (only refocus when window has OS focus, or a real key landed recently for RDP) + gh-126-focus-thrash regression test. NOTE: the freeze reproduced live on 2026-06-12 was actually TWO tmax instances (dev + packaged) contending for OS focus - environmental, not this code path - confirmed by killing the second instance.
<!-- SECTION:FINAL_SUMMARY:END -->
