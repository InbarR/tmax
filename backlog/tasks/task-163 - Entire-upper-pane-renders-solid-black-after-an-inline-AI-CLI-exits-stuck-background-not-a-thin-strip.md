---
id: TASK-163
title: >-
  Entire upper pane renders solid black after an inline AI CLI exits (stuck
  background, not a thin strip)
status: Done
assignee:
  - '@inrotem'
created_date: '2026-06-11 15:07'
updated_date: '2026-06-13 13:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (2026-06-11, screenshot clipboard-2026-06-11T15-00-46): a wide black strip renders across the prompt line in a plain PowerShell pane that had hosted an AI CLI. Hypothesis: an unterminated background-color SGR left behind when an inline (Ink) AI CLI exited/was killed; back-color-erase then fills the rest of the prompt row black. May share a root cause with the stuck-mouse-tracking issue (abrupt TUI exit leaving terminal state dirty). Needs a clearer crop of the bar to confirm whether it is a stuck SGR fill, the TASK-48/53 prompt-decoration accent bar mis-rendering, or an overlay element.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No persistent black strip remains across the prompt line after an AI CLI exits
- [ ] #2 Root cause identified (stuck SGR vs prompt decoration vs overlay) and pinned by a test or documented repro
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Clearer screenshot (clipboard-2026-06-11T15-10-01): it is NOT a thin strip - the whole upper area of the pane renders pure black while the sibling pane shows the normal themed (dark purple) background. Shell prompt sits at the bottom of the black fill. Signature of a stuck black-background SGR / full erase left by an abruptly-exited inline TUI (back-color-erase fills empty rows black).

Shares root cause with TASK-162 (dirty terminal state on TUI exit). MOUSE_RESET_SEQUENCE resets mouse modes but NOT SGR, so the cleanup path should also emit [0m (and likely [?2004l). Note: resetting SGR only prevents FUTURE black fill; already-black buffer cells need a redraw/clear to repaint.

Confirmed same root cause as TASK-162: stuck alternate-screen buffer. The black slab is the dead TUI’s alt-buffer paint; exiting alt-screen (now part of TERMINAL_RECOVER_SEQUENCE) restores the normal buffer so the black disappears and scrollback returns. Fix + test ship with TASK-162.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Same fix as TASK-162: exiting the stuck alternate screen restores the normal buffer, so the leftover black slab disappears. Shipped + tested with TASK-162.
<!-- SECTION:FINAL_SUMMARY:END -->
