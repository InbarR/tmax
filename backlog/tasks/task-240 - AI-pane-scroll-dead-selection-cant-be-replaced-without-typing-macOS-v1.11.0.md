---
id: TASK-240
title: >-
  AI-pane scroll dead + selection can't be replaced without typing (macOS,
  v1.11.0)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-15 07:10'
updated_date: '2026-06-15 07:10'
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
- [ ] #1 In an AI CLI pane, a second left-drag replaces the previous selection without needing to type first
- [ ] #2 Wheel scrolls an alt-screen app that is not tracking the mouse by emitting arrow keys (Up/Down)
- [ ] #3 Arrow encoding honors DECCKM (application cursor keys -> SS3 O A/B)
- [ ] #4 When an alt-screen app IS tracking the mouse, wheel is still forwarded as a mouse report (no synthesized arrows)
- [ ] #5 Plain-shell scrollback wheel scroll and shift+wheel forwarding are unaffected
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
- Selection fix: handleLeftMouseDown now clears an existing selection (guarded !shiftKey) so a fresh drag/click starts a new selection. Root cause was the mouseup synth-select gate !term.hasSelection().
- Scroll fix: added alternate-scroll translation in attachCustomWheelEventHandler - when tracking===none && buffer is alternate, emit Up/Down arrows (SS3 when applicationCursorKeysMode). xterm 5.5 has no DEC 1007.
- Typecheck: zero new errors (only a pre-existing error line-shifted).
- Added tests/e2e/task-240-ai-pane-scroll-and-reselect.spec.ts (4 tests). out-e2e is stale (Jun 12) - needs rebuild before running, holding per no-blind-e2e guidance.
<!-- SECTION:NOTES:END -->
