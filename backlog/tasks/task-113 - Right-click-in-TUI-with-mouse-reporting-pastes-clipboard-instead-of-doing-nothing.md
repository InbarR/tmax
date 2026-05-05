---
id: TASK-113
title: >-
  Right-click in TUI with mouse reporting pastes clipboard instead of doing
  nothing
status: Done
assignee: []
created_date: '2026-05-04 20:21'
updated_date: '2026-05-04 20:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a TUI like Copilot CLI enables drag-tracking mouse modes (?1002h/?1003h), drag-select is consumed by the pty and xterm never creates a DOM selection. The right-click handler then sees hasSelection()===false and falls through to paste, dumping the clipboard into the TUI input. The earlier image-only fix (TASK-66) only covered the image-clipboard variant. Merged via external PR #90 from @eladavraham (b3485c1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drag-select in a TUI with mouse reporting + right-click does NOT paste clipboard
- [x] #2 Right-click without preceding drag in a normal shell still pastes
- [x] #3 PSReadLine click-to-position still works (single click is not treated as drag)
- [x] #4 Ctrl+V still pastes explicitly in all cases
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped via external contribution PR #90 (commit b3485c1) by @eladavraham. Tracks recent left-button drag attempts; when a drag occurred while mouse tracking was active and produced no xterm selection, suppresses the auto-paste on the next right-click (3s window). Narrower than blocking all paste under mouse reporting, so PSReadLine click-to-position is preserved. Ctrl+V remains the explicit paste path. Tests cover both the suppressed-paste case and the no-mouse-reporting passthrough.
<!-- SECTION:FINAL_SUMMARY:END -->
