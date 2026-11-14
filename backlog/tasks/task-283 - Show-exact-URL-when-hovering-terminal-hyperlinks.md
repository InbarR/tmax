---
id: TASK-283
title: Show exact URL when hovering terminal hyperlinks
status: Done
assignee:
  - '@yoziv'
created_date: '2026-09-15 05:11'
updated_date: '2026-09-15 11:46'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Terminal links can be long, wrapped, or visually ambiguous. Add a small local-only hover popover so users can verify the exact HTTP(S) destination before opening it. GitHub issue: https://github.com/InbarR/tmax/issues/148
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hovering a detected HTTP(S) link shows the complete exact URL after a short delay
- [x] #2 Long URLs remain readable without overflowing the window
- [x] #3 The preview dismisses on pointer leave, terminal scroll, or Escape
- [x] #4 Existing hyperlink activation behavior remains unchanged
- [x] #5 Regular and detached terminal windows provide consistent hover previews
- [x] #6 The feature performs no page metadata or remote-content requests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared delayed URL-hover popover helper with viewport clamping and cleanup; 2. Wire it into regular and detached terminal link providers without changing activation; 3. Cover positioning and real Electron hover/dismissal behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a shared exact-URL hover preview for both terminal surfaces. During E2E validation, separated actual scroll dismissal from the passive 750 ms scroll-state poll so the poll cannot cancel the hover delay. Verified with 3 unit tests, 1 packaged Electron E2E test, a successful package build, and git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a local-only exact-URL hover preview for terminal hyperlinks. The shared helper supports delayed display, viewport clamping, long-URL wrapping, Escape/leave/scroll dismissal, and deterministic cleanup; both main and detached terminals use it without changing link activation. Added 3 passing unit tests and 1 passing packaged Electron E2E test; npm run package and git diff --check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
