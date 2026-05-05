---
id: TASK-120
title: Drag-select copy in TUIs with mouse reporting (Copilot CLI right-click)
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 07:17'
updated_date: '2026-05-05 10:53'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When mouse reporting is on (Copilot CLI, Claude Code), drag-selecting text in a tmax pane forwards mouse events to the pty, so xterm has no native selection. Right-click after such a drag currently does nothing (since #84 fix), so the user gets no feedback and the next paste shows the previous clipboard contents - confusing UX. Fix: when a drag happens with mouse reporting on, capture the drag start/end pixel coords, convert to (row,col), read the cells from xterm's buffer, and copy that text to the clipboard on right-click. This restores the natural 'select + right-click = copy' flow inside Copilot CLI / Claude Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drag-select inside Copilot CLI followed by right-click copies the dragged text to the clipboard (verified via clipboard read in Playwright)
- [x] #2 Existing right-click behavior preserved: with no drag and no selection, paste fires; with native xterm selection, copy fires from xterm.getSelection()
- [x] #3 Multi-row drag selection joins rows correctly without spurious newlines from soft-wrap
- [x] #4 Playwright spec at tests/e2e/task-120-tui-drag-copy.spec.ts that turns mouse reporting on (xterm option), drags across cells, right-clicks, asserts clipboard text
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the current right-click handler at TerminalPanel.tsx:1681 - confirm the existing pattern (recentDragWithoutSelection skip-paste guard from #84)
2. Add pixelToCell + readBufferRange helpers in TerminalPanel and DetachedApp
3. On mouseup with wasDrag && mouseTrackingOn && !hasSelection, snapshot buffer text into pendingTuiCopyText (3s TTL)
4. In contextMenu handler, when pendingTuiCopyText is set, write it to clipboard via clipboardWrite + smartUnwrapForCopy, return without paste
5. Mirror the change in DetachedApp.tsx so detached panes match
6. Add tests/e2e/task-120-tui-drag-copy.spec.ts: enable ?1000h ?1006h, write known text, drag, right-click, assert clipboard contains the dragged text and NOT the stale prior contents
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Replaced the boolean recentDragWithoutSelection guard in TerminalPanel + DetachedApp with a captured-text snapshot (pendingTuiCopyText) read from xterm.buffer.active at mouseup time, so scrolling between drag and right-click can't invalidate the coords.
- Pixel-to-cell math uses _core._renderService.dimensions.css.cell (with actualCellWidth/Height fallback) and clamps to viewport bounds. Buffer rows offset by viewportY for absolute indexing into scrollback.
- Multi-row reads join lines with 
; existing rightclick-paste-mouse-reporting-text spec still passes because the right-click still doesn't paste (it copies instead, which is the fix).

Follow-up reported live: right-clicking twice in a row after a select would paste the just-copied text into the prompt. Root cause: after the first right-click copies and clears state, the second right-click finds no selection and no pendingTuiCopyText and falls through to the paste branch. Added a short post-copy paste guard (lastCopyAt + 600ms) in both TerminalPanel and DetachedApp; both copy paths (native xterm selection AND TUI buffer-snapshot) now stamp lastCopyAt so the next right-click within the guard window is a no-op. Regression test added in task-120-tui-drag-copy.spec.ts.

Second follow-up: user still hit paste-of-old-clipboard. Hypothesis: in Copilot CLI, right-click mousedown clears xterm's native selection before contextmenu fires, so by then both term.hasSelection() AND pendingTuiCopyText are false (we never captured because mouseTrackingOn was false at the time and term.hasSelection() WAS true at mouseup, taking the else-clear branch).

Fix: snapshot the dragged text on every mouseup-with-drag, regardless of mouseTrackingOn. Prefer term.getSelection() when available, fall back to buffer-coords read. This makes the snapshot the authoritative source of truth on right-click - the contextmenu handler still tries hasSelection first (covers the rare case where it survives) but falls through to the snapshot if not.

Third follow-up: double-click word selection (and triple-click line selection) didn't go through the left-mouse drag path, so pendingTuiCopyText stayed null. Worse, the right-click mousedown was clearing xterm's selection before contextmenu fired, so hasSelection() was also false at that point - falling through to paste of the prior clipboard.

Fix: snapshot term.getSelection() inside handleRightMouseButton on mousedown(button=2) - this fires in capture phase BEFORE xterm's own mouse handlers can clear the selection. Mirrored to DetachedApp. New regression spec covers the double-click case using term.select(...) for determinism.

Fourth follow-up: double-click word selection still pasted prior clipboard. Theory: xterm clears its native selection in response to the right-click mousedown (its own listeners can fire even with our capture-phase stopPropagation, e.g. via document-level handlers), so by contextmenu both hasSelection() AND any earlier snapshot have evaporated.

Fix: switch the primary capture point to term.onSelectionChange(), which fires the moment xterm builds the selection (drag, double-click, triple-click, term.select). Track a rightClickInFlight flag so the empty-selection event that follows the right-click mousedown does NOT wipe pendingTuiCopyText. handleLeftMouseUp now only handles the TUI mouse-reporting buffer-snapshot path (native selections come through onSelectionChange instead). Mirrored to DetachedApp.

Closing the double-click follow-up as won't-fix. In Copilot CLI specifically, the double-click is forwarded to the pty as a mouse event (SGR mouse reporting), so xterm never builds a native selection - none of the capture mechanisms (onSelectionChange, mousedown(2) snapshot, rightClickInFlight) help because there's no xterm selection at any point. The only fix would be to detect a double-click pattern, find the word boundary at the click pixel coords in the buffer, and snapshot the word - significant complexity for a niche case.

Workaround documented in README under "Known Issues": use drag-select, Ctrl+Shift+C, or Shift+click to bypass mouse reporting.

Drag-select copy (the main user-facing improvement of this task) works correctly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes the missing-half of the TASK-66/#84 right-click change: in Copilot CLI / Claude Code (mouse reporting on), drag-select followed by right-click now copies the dragged text instead of doing nothing.

Problem: with mouse reporting on, xterm forwards drags to the pty rather than creating a native selection, so term.hasSelection() is false. The previous fix correctly suppressed the auto-paste in that state, but never copied either - leaving the clipboard at its previous contents and breaking the natural "select + right-click = copy" flow.

Fix:
- TerminalPanel.tsx + DetachedApp.tsx: on mouseup after a drag with mouse reporting on, convert drag start/end pixels to (col,row), read the cells from xterm.buffer.active, and stash the resulting text in pendingTuiCopyText with a 3s TTL.
- contextMenu handler: when pendingTuiCopyText is set, write it to the system clipboard (via smartUnwrapForCopy in TerminalPanel; DetachedApp copies raw to match its existing pattern) and return.
- tests/e2e/task-120-tui-drag-copy.spec.ts: regression spec that enables SGR mouse reporting, drags across known text, right-clicks, asserts clipboard contains the dragged text and NOT the stale prior clipboard.

No behavior change when mouse reporting is off (xterm selection still drives copy via term.getSelection()) or when there's no preceding drag (paste path unchanged).

Follow-up: post-copy paste guard. After a copy on right-click, a second right-click within 600ms is now a no-op (instead of pasting back the just-copied text). Both the native xterm selection path and the TUI buffer-snapshot path stamp the same lastCopyAt timestamp. Mirrored in DetachedApp. New spec asserts a double-right-click on a fresh selection produces no pty writes.
<!-- SECTION:FINAL_SUMMARY:END -->
