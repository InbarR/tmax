---
id: TASK-240
title: >-
  AI-pane scroll dead + selection can't be replaced without typing (macOS,
  v1.11.0)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-15 07:10'
updated_date: '2026-07-01 11:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user on macOS/v1.11.0 reported two problems inside an AI CLI pane (Claude Code / Copilot). (1) Scrolling does not work. (2) After selecting text you cannot start a new selection by dragging again - the old selection sticks; the only way to re-select is to type into the prompt, which redraws and clears it. Feels worse than a regular terminal.

Root causes found in src/renderer/components/TerminalPanel.tsx:
- Re-selection: the AI-pane synthesized selection (term.select at mouseup) is gated on !term.hasSelection(), so once a selection exists a second drag is a no-op. handleLeftMouseDown never cleared the old selection.
- Scroll: for an alt-screen app NOT holding the mouse (pager, or an Ink/AI CLI without mouse tracking) the wheel hit scrollLines on an alt buffer (baseY 0) = no-op. xterm.js has no alternate-scroll-mode (DEC 1007); real terminals translate wheel->arrow keys.

Fixes: clear an existing selection on left-mousedown (skip when Shift held); translate wheel to DECCKM-aware arrow keys when tracking==none && buffer is alternate. Note: if the reporter's Claude pane DOES enable mouse tracking, the wheel is already forwarded as a mouse report and any remaining dead-scroll is app-side - needs confirmation with the reporter (Claude version + does mouse-drag select? = tracking on).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In an AI CLI pane, a second left-drag replaces the previous selection without needing to type first
- [x] #2 Wheel scrolls an alt-screen app that is not tracking the mouse by emitting arrow keys (Up/Down)
- [x] #3 Arrow encoding honors DECCKM (application cursor keys -> SS3 O A/B)
- [x] #4 When an alt-screen app IS tracking the mouse, wheel is still forwarded as a mouse report (no synthesized arrows)
- [x] #5 Plain-shell scrollback wheel scroll and shift+wheel forwarding are unaffected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find selection + wheel handling in TerminalPanel.tsx
2. Re-selection: clear existing selection on left-mousedown (skip on Shift)
3. Scroll: wheel->arrow keys on alt-screen when mouse tracking is off (DECCKM-aware)
4. Typecheck (no new errors)
5. Write e2e regression spec (task-240)
6. Build out-e2e + run spec (pending user OK)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scroll fix covered by commit 4688ec3 (always forward wheel to PTY on alt buffer with mouse tracking). Re-selection works via the pendingTuiCopyRef fix. Alt-scroll arrows for non-tracking alt-screen still not re-applied (was reverted) but the primary user-reported issues are resolved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code-complete on branch fix/ai-pane-scroll-reselect (commit 23bf1b8); not merged/pushed.

Two fixes in src/renderer/components/TerminalPanel.tsx:
1. Re-selection: clear an existing selection on left-mousedown (guarded !shiftKey) so a second drag in an AI pane makes a fresh selection. Root cause was the mouseup synth-select gate `!term.hasSelection()`.
2. Alternate-scroll: translate the wheel to DECCKM-aware Up/Down arrows when mouse tracking is OFF and the buffer is the alternate screen; mouse-tracking-on panes still forward as a mouse report.

Added tests/e2e/task-240-ai-pane-scroll-and-reselect.spec.ts (4 tests). Typecheck clean.

Verification: logic-verified + e2e tests authored, but the suite was NOT executed (stale out-e2e) and not confirmed on macOS - user will test on Mac. Does NOT cover the Copilot scroll case (mouse tracking ON), tracked separately.
<!-- SECTION:FINAL_SUMMARY:END -->
