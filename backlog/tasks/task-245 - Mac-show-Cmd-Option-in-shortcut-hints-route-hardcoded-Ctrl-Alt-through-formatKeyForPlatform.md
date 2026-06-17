---
id: TASK-245
title: >-
  Mac: show Cmd/Option in shortcut hints (route hardcoded Ctrl/Alt through
  formatKeyForPlatform)
status: Done
assignee: []
created_date: '2026-06-17 09:15'
updated_date: '2026-06-17 09:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Mac user reported shortcut hints show 'Ctrl' where they should show Cmd (and Alt->Option). The helper formatKeyForPlatform() (utils/platform.ts) already renders Ctrl->Cmd and Alt->Option on Mac, but many display strings were hardcoded and bypassed it - most visibly the pane context menu. Routed them through the helper. Left genuinely-Ctrl-on-Mac strings untouched: Ctrl+Scroll zoom (useZoom uses ctrlKey) and terminal-control tips (Ctrl+U/Ctrl+C).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pane context menu shortcut hints render Cmd/Option on Mac (Rename/Refresh/New-in-place/Show prompts/Prompt Editor/Float/Hide/Close)
- [x] #2 StatusBar tooltips, overflow-menu hints, and tip-ticker app shortcuts render Cmd/Option on Mac
- [x] #3 Transcript search, markdown Ctrl/Cmd+Click preview, and Backlog Ctrl/Cmd+Enter hints render Cmd on Mac
- [x] #4 Genuinely-Ctrl strings unchanged: Ctrl+Scroll zoom and terminal Ctrl+U/Ctrl+C tips
- [x] #5 No-op on Windows/Linux; typecheck clean
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Routed hardcoded Ctrl/Alt shortcut-display strings through formatKeyForPlatform() so Mac shows Cmd/Option. Changed: TerminalPanel pane context menu (8 spans) + 2 tooltips + diag hint; StatusBar 3 tooltips + 3 overflow-menu spans + 9 tip strings; TranscriptPanel search tooltip; md-link-parser Ctrl/Cmd+Click tooltip; BacklogBoard Ctrl/Cmd+Enter placeholder (+imports where missing). Left as Ctrl (correct on Mac): ZoomControls Ctrl+Scroll (useZoom keys on ctrlKey) and the Ctrl+U/Ctrl+C terminal-control tip. Verified the modifier bindings (search/save/link-preview accept metaKey) before converting. formatKeyForPlatform is a no-op off macOS, so Windows/Linux are unchanged. Typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
