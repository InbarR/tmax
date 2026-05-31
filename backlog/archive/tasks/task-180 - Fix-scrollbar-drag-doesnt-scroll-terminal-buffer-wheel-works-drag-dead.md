---
id: TASK-180
title: 'Fix: scrollbar drag doesn''t scroll terminal buffer (wheel works, drag dead)'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-29 08:36'
updated_date: '2026-05-29 09:44'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On resumed Copilot/Claude CLI sessions (and other panes), the user can scroll the terminal with the mouse wheel but dragging the always-visible xterm scrollbar thumb does not move the buffer content. Root cause: tmax intercepts wheel directly via term.scrollLines() (TerminalPanel.tsx ~1515), but scrollbar drag relies on xterm's internal Viewport._onScroll to map scrollTop->ydisp, which the code itself documents as unreliable (TerminalPanel.tsx ~1253). The existing DOM scroll listener on .xterm-viewport only updates the jump-to-bottom arrow; nothing syncs the dragged scrollTop back into xterm's buffer. Reported 2026-05-29 with screenshot of a resumed Copilot session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dragging the xterm scrollbar thumb scrolls the terminal buffer content in sync with the thumb position
- [x] #2 Wheel scrolling continues to work unchanged (no regression), including the Ink/TUI mouse-tracking forward path
- [x] #3 No scroll feedback loop or jitter between xterm's own scrollTop sync and the new drag handler
- [x] #4 Playwright e2e test reproduces the drag-scroll behavior and passes with the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce with Playwright: open a pane with real xterm scrollback (baseY>0), programmatically drag the .xterm-viewport scrollTop (set scrollTop + dispatch scroll), assert term.buffer.active.viewportY does NOT track it (failing repro).\n2. Add a DOM 'scroll' listener on .xterm-viewport that maps scrollTop->target buffer line (round(scrollTop / cellHeight)) and calls term.scrollToLine(targetLine) when it differs from viewportY. Guard against feedback: after wheel/scrollLines xterm sets scrollTop = viewportY*cellHeight, so targetLine==viewportY and we no-op. Skip when cellHeight unknown.\n3. Ensure no interference with the Ink/TUI mouse-tracking forward path (that path keeps baseY===0, scrollHeight==clientHeight, so drag is inert anyway).\n4. Reuse/extend the existing scroll listener (line ~1270) rather than adding a second to avoid double work; keep updateScrolledAway behavior.\n5. Run the new spec headed/single; confirm drag now moves the buffer and wheel still works.\n6. Clean up listener in the existing teardown (line ~2365).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented scrollbar-drag->buffer sync in TerminalPanel.tsx: viewport scroll listener maps scrollTop->targetLine and calls term.scrollToLine(), gated on an active scrollbar interaction (mousedown past content-box width) to avoid yanking during streaming/programmatic scrolls. No new type errors. Shipped in 76c5b40.

PENDING user verification in the running app: (1) scrollbar drag scrolls buffer, (2) wheel still works, (3) no jump during streaming. Playwright repro/test deferred (skipped per session preference of fixing directly).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed scrollbar drag not scrolling the terminal buffer (wheel worked, drag was dead).

Root cause: xterm 5.5 Viewport._handleScroll bails when !viewportElement.offsetParent (true inside a position:fixed ancestor - focus-mode wrapper, floating panel, workspace grid), so native scrollbar scroll events are ignored. Wheel kept working because TerminalPanel intercepts wheel directly via scrollLines().

Fix (TerminalPanel.tsx): an independent scroll listener on .xterm-viewport maps scrollTop -> buffer line and calls term.scrollToLine(). No offsetParent guard, so it scrolls where xterm bails. A first attempt gated this on a scrollbar-gutter mousedown, but native scrollbar clicks dont fire mousedown on the element in Chromium, so the gate was removed; the sync is a no-op for programmatic/streaming scrolls since xterm sets scrollTop = viewportY*cellHeight (targetLine === viewportY).

Verified with a Playwright regression test (tests/e2e/task-180-scrollbar-drag.spec.ts) that reproduces the offsetParent-null bail and asserts the buffer scrolls to the dragged row - passes with the fix, would fail without it (xterm fires nothing in that state). Shipped in d633a95 (+ e36b994).
<!-- SECTION:FINAL_SUMMARY:END -->
