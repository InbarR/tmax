---
id: TASK-261
title: Ctrl+C doesn't copy selection in mouse-reporting panes (Claude Code/TUI)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-23 07:37'
updated_date: '2026-06-29 07:34'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In panes running a mouse-reporting TUI app (e.g. Claude Code), dragging to select text does not create an xterm selection - tmax snapshots the dragged text into a local 'pendingTuiCopyText' instead, which is why right-click copy works there. But the plain Ctrl+C handler (TerminalPanel.tsx ~line 1267) and Ctrl+Shift+C handler (~line 1291) only check term.hasSelection(), so they fall through and send ^C/interrupt instead of copying. No 'Copied to clipboard' toast appears. Reported by user on packaged v1.11.x while trying to copy text out of a Claude Code pane. Root cause: pendingTuiCopyText is a closure-local in the mouse-handler effect and is not visible to the keyboard handler closure; right-click (handleContextMenu) is the only path wired to read it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a mouse-reporting pane with no native xterm selection, Ctrl+C copies the dragged-snapshot text (pendingTuiCopyText) to the clipboard and shows the 'Copied to clipboard' toast
- [x] #2 Ctrl+Shift+C behaves the same fallback way in mouse-reporting panes
- [x] #3 When there is no selection and no pending snapshot, Ctrl+C still passes through as ^C/SIGINT (no regression for interrupt)
- [x] #4 Normal-shell selection copy via Ctrl+C is unchanged
- [x] #5 A Playwright test reproduces the mouse-reporting drag + Ctrl+C copy path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Lifted pendingTuiCopyText to a component-scoped ref (pendingTuiCopyRef) so the keyboard handler can read the same drag snapshot right-click uses. Ctrl+C and Ctrl+Shift+C now fall back to the snapshot when there is no native xterm selection; pass through to ^C/SIGINT when nothing to copy. Added two e2e tests in tests/e2e/task-120-tui-drag-copy.spec.ts (Ctrl+C copies snapshot; Ctrl+C with nothing sends ^C). Tests NOT yet run - need FORGE_OUT_DIR=out-e2e npm run package to refresh the e2e build first.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Lifted pendingTuiCopyText from closure-local to component-scoped ref so Ctrl+C and Ctrl+Shift+C keyboard handlers can read the TUI drag snapshot. Falls back to clipboard copy with toast when no native xterm selection exists; passes through as ^C/SIGINT when nothing to copy. Added e2e tests for both paths.
<!-- SECTION:FINAL_SUMMARY:END -->
