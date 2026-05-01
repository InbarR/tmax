---
id: TASK-54
title: >-
  Smart unwrap also fires browser default copy - clobbers our unwrapped
  clipboard
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 13:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-52 wired smartUnwrapForCopy into 4 xterm copy paths, but xterm 5.5 uses real DOM Range selection so the browser default Ctrl+C fires after our handler and overwrites our unwrapped write. Add event.preventDefault() in keydown copy handlers + intercept the document copy event on the xterm container.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ctrl+C on selected wrapped paragraph in CC/Copilot CLI pastes as a single line in Teams
- [ ] #2 Ctrl+Shift+C also unwraps
- [ ] #3 Right-click copy still works
- [ ] #4 Toggling Settings > Smart unwrap on copy off restores raw newlines
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
event.preventDefault on Ctrl+C / Ctrl+Shift+C handlers + addEventListener(copy, capture) on container that rewrites clipboardData.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both xterm keydown copy paths now call event.preventDefault(). Added a capture-phase copy listener on the xterm container that calls smartUnwrapForCopy on the selection and writes via both clipboardData.setData and IPC clipboardWrite. Verified with shipped 13 unit tests; build clean.
<!-- SECTION:FINAL_SUMMARY:END -->
