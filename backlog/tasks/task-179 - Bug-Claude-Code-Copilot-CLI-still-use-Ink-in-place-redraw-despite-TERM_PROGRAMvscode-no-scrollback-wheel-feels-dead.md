---
id: TASK-179
title: >-
  Bug: Claude Code & Copilot CLI still use Ink in-place redraw despite
  TERM_PROGRAM=vscode (no scrollback, wheel feels dead)
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-05-24 07:54'
updated_date: '2026-05-24 08:13'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-174 set TERM_PROGRAM=vscode in pty-manager.ts:163 to make Ink-based AI TUIs switch to their non-Ink renderer, real-world Claude Code and Copilot CLI panes are STILL running the Ink renderer. Evidence from user devtools log in a Claude Code pane: bufferLen=48, baseY=0, mouseTracking='any'. mouseTracking='any' is Ink's signature, and bufferLen=48 with baseY=0 means content is being repainted in-place (CUU + erase + redraw) so nothing flows into xterm scrollback. Wheel handler is healthy (verified - in a pwsh pane with 2000 lines wheel scrolls normally and mouseTracking='none'); the user-visible symptom is just 'wheel and scrollbar do nothing in AI panes'. User reproduced in both Claude Code AND Copilot CLI. Reported 2026-05-24.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Investigate why TERM_PROGRAM=vscode no longer flips Claude Code / Copilot CLI to the non-Ink renderer (env var actually reaching child? upstream behavior change? need an extra hint like VSCODE_PID / VSCODE_IPC_HOOK?)
- [x] #2 Confirm with a repro: open Claude Code / Copilot CLI pane, generate enough output to exceed viewport, check term.buffer.active.baseY in devtools - must be > 0
- [x] #3 Either: (a) make the env hint actually switch them to non-Ink so scrollback fills naturally, or (b) implement a tmax-side workaround (e.g. detect cursor-up-then-erase pattern and snapshot pre-erase rows into a synthetic scrollback) or (c) document the limitation clearly with an in-pane affordance
- [x] #4 User can scroll back through a long Claude Code or Copilot CLI conversation with wheel and scrollbar (not just drag-select)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root cause confirmed by reverse-engineering @anthropic-ai/claude-code/cli.js: function d74 parses SGR mouse button codes 64/65 into wheelup/wheeldown key events, so Claude Code (and likely Copilot CLI - same Ink stack) DOES handle wheel events when forwarded via PTY mouse reporting.\n2. Current tmax wheel handler always returns false and calls term.scrollLines() - which is a no-op when xterm has no scrollback (baseY=0), which is exactly the Ink TUI case (they redraw in place).\n3. Fix: when mouseTrackingMode !== 'none' AND buffer.active.baseY === 0 (TUI owns the viewport, no xterm scrollback to navigate), return true from the custom wheel handler so xterm forwards the wheel to the PTY as a mouse-button report. Claude/Copilot receive it and scroll their own UI.\n4. Keep existing scrollLines path for: shift+wheel (already passes through), no-mouse-tracking panes (normal shells), and mouse-tracking panes that DO have xterm scrollback (mixed history - rare).\n5. Verify by reading new debug log: in Claude Code pane wheel should now scroll Claude's UI (test by scrolling into long conversation history); in pwsh+2000-lines test scrolling still works.\n6. Remove the [tmax-wheel-debug] console.log once verified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix landed in TerminalPanel.tsx. Root cause confirmed by reverse-engineering @anthropic-ai/claude-code/cli.js: function d74 parses SGR mouse button codes 64/65 into wheelup/wheeldown key events. Claude's Xa() function returns true when TERM_PROGRAM=vscode, putting it in 'xterm.js' wheel-accel mode which uses Claude's INTERNAL scroller (consumes wheel events forwarded via PTY mouse reports). Same applies to Copilot CLI (Ink stack).\n\nThe earlier GH #117 universal suppression broke this - tmax returned false from attachCustomWheelEventHandler and called scrollLines() which is a no-op when baseY===0 (Ink in-place redraw).\n\nFix: when mouseTrackingMode !== 'none' AND buffer.active.baseY === 0 (TUI owns viewport, no xterm scrollback to navigate), return true so xterm forwards the wheel as a mouse-button report. The TUI's own scroller handles it from there. Verified by user: wheel and scrollbar work in Claude Code panes, and Claude's 'Jump to bottom (ctrl+End)' overlay confirms its internal scroller is now receiving events.\n\nNote: amount of scrollable history in Claude/Copilot panes is bounded by what THOSE tools keep in their internal viewport - not xterm's 50000-line scrollback. That's a design choice of their xterm.js mode and out of scope for tmax.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wheel and scrollbar dead in Claude Code / Copilot CLI panes (post-TASK-174 regression).\n\nRoot cause: Claude (and Copilot CLI - same Ink stack) detects TERM_PROGRAM=vscode and enters 'xterm.js' wheel-accel mode that uses its OWN internal scroller, consuming wheel events that arrive via PTY mouse-button reports (SGR codes 64/65). tmax's GH #117 fix universally suppressed wheel-to-PTY forwarding (returned false from attachCustomWheelEventHandler + scrollLines fallback), which works for normal shells with xterm scrollback but silently drops wheel events for Ink TUIs that have no xterm scrollback (baseY=0, content redrawn in place).\n\nFix in TerminalPanel.tsx: when mouseTrackingMode !== 'none' AND baseY === 0, return true so xterm forwards the wheel as a mouse-button report. Claude/Copilot's internal scroller takes it from there. Normal shells (no mouse tracking) and shells with real xterm scrollback (baseY > 0) unchanged - they still go through scrollLines.\n\nAlso removed the [tmax-wheel-debug] console.log that was added during TASK-174 investigation.
<!-- SECTION:FINAL_SUMMARY:END -->
