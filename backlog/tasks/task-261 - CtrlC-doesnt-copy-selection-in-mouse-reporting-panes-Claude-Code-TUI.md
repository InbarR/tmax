---
id: TASK-261
title: Ctrl+C doesn't copy selection in mouse-reporting panes (Claude Code/TUI)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-23 07:37'
updated_date: '2026-06-24 10:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In panes running a mouse-reporting TUI app (e.g. Claude Code), dragging to select text does not create an xterm selection - tmax snapshots the dragged text into a local 'pendingTuiCopyText' instead, which is why right-click copy works there. But the plain Ctrl+C handler (TerminalPanel.tsx ~line 1267) and Ctrl+Shift+C handler (~line 1291) only check term.hasSelection(), so they fall through and send ^C/interrupt instead of copying. No 'Copied to clipboard' toast appears. Reported by user on packaged v1.11.x while trying to copy text out of a Claude Code pane. Root cause: pendingTuiCopyText is a closure-local in the mouse-handler effect and is not visible to the keyboard handler closure; right-click (handleContextMenu) is the only path wired to read it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a mouse-reporting pane with no native xterm selection, Ctrl+C copies the dragged-snapshot text (pendingTuiCopyText) to the clipboard and shows the 'Copied to clipboard' toast
- [ ] #2 Ctrl+Shift+C behaves the same fallback way in mouse-reporting panes
- [ ] #3 When there is no selection and no pending snapshot, Ctrl+C still passes through as ^C/SIGINT (no regression for interrupt)
- [ ] #4 Normal-shell selection copy via Ctrl+C is unchanged
- [ ] #5 A Playwright test reproduces the mouse-reporting drag + Ctrl+C copy path
<!-- AC:END -->
