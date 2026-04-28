---
id: TASK-33
title: tmax copy inserts hard newlines at visual wrap points
status: Done
assignee: []
created_date: '2026-04-28 10:12'
updated_date: '2026-04-28 10:57'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user selects multi-line text in a tmax terminal pane and copies it (Ctrl+C with selection or selection-on-Enter), wrapped lines come out of the clipboard with literal 
 inserted at the visual wrap column. The user noticed this when pasting a JS snippet from a tmax pane into Chrome DevTools - a single-line "Allow rebinding" string was rendered as "Allow" on row N and "rebinding" on row N+1 (because the line exceeded terminal width), and the paste produced "Al
low rebinding".

xterm.js's default copy behavior is supposed to join wrap-continuation rows back into the original logical line; we may have buffer reflow disabled, an addon stripping the wrap metadata, or a custom getSelection path that walks visual rows. Worth checking term.options.disableStdin, term.buffer.active.getLine().isWrapped, and any custom copy handlers.\n\nUser-visible symptom: pasted commands break, pasted URLs split, pasted code introduces SyntaxError. Aside from the obvious "wrong content" annoyance, this is an active footgun for any user who copies multi-line content out of tmax.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting and copying a single logical line that visually wraps yields a clipboard payload with no embedded \n
- [ ] #2 Selecting and copying multiple real lines (with hard newlines from the shell) preserves those newlines correctly
- [ ] #3 Works in both main and detached terminal windows
- [ ] #4 Repro: paste a long string into Claude Code, select it, copy, paste into a different app - clipboard content matches the original logical text
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigated with a Playwright regression (tests/e2e/xterm-soft-wrap-copy.spec.ts). Wrote a 448-char single-string payload (no embedded 
) into a 143-col xterm; payload spans 4 rows. Continuation rows correctly carry isWrapped=true. term.getSelection() returns the full 448 chars with hasNewline=false, newlineCount=0.

Conclusion: xterm + tmax correctly join soft-wrapped lines on copy. The user-reported symptom ("Allow rebinding" -> "Al
low rebinding") happens because the SOURCE (Claude Code, or any AI tool that hand-wraps its prose to terminal width) emits real 
 at the wrap point. tmax preserves what was sent - no tmax-side fix that doesn't risk mangling legitimate indented content.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Not a tmax bug. xterm soft-wrap is correctly joined on copy; verified by tests/e2e/xterm-soft-wrap-copy.spec.ts. The reported symptom is an upstream AI tool formatting choice that emits real 
 at wrap points; tmax preserves what was emitted. If we ever want to add a heuristic "join prose wraps on copy", that's a feature, not a bug fix.
<!-- SECTION:FINAL_SUMMARY:END -->
