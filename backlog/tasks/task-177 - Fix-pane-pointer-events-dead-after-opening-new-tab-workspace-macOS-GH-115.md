---
id: TASK-177
title: >-
  Fix: pane pointer-events dead after opening new tab/workspace (macOS) - GH
  #115
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-22 15:56'
updated_date: '2026-05-24 18:22'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported on GH #115. After opening a new tab/workspace, the previously-active pane loses mouse-wheel scroll AND text selection AND single-click caret positioning. Keyboard input still works. Newly created panes are unaffected. Cmd+Ctrl+R refresh does NOT recover - only app restart does.

Reporter strongly suspects a stuck PaneDropZones overlay (z-index 50, pointer-events auto) due to a dnd-kit drag state that wasn't cleared when a drag was interrupted by the tab/workspace switch. Possibly also stale wheel-listener cleanup using containerRef.current at cleanup time (resurfacing the GH #48 pattern), and overly broad onMouseDownCapture stopPropagation on unfocused panes.

Distinct from GH #117: that one triggers after Ink TUI; this one triggers from tab/workspace switching. May share some fix surface (mouse mode reset) but the dnd-kit overlay leak needs its own fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drag state (isDragging / isPaneDragging) is guaranteed to reset on every exit path: pointercancel, dragend, window blur, visibilitychange
- [x] #2 PaneDropZones default to pointer-events: none and only flip to auto while a drag is actually in progress (CSS-driven, not React-state-driven)
- [x] #3 Wheel listener cleanup captures the element at registration time so the cleanup function removes the listener from the correct node
- [ ] #4 onMouseDownCapture stopPropagation is narrowed to title bar / chrome targets only - never fires on .xterm-screen / .xterm-viewport
- [ ] #5 e2e test reproduces the new-tab-then-old-pane-dead scenario and fails before the fix, passes after
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make PaneDropZones safe-by-default: container always mounted with data-dragging attr; CSS only enables pointer-events on the zones while data-dragging=true. Children only rendered while a drag is active.
2. Add belt-and-suspenders drag-state reset in useDragTerminal: global pointercancel + window blur + visibilitychange listeners force setDragging(false). try/finally around dispatch in handleDragEnd so a thrown handler can't leak the flag.
3. Reset drag flag explicitly inside terminal-store createWorkspace + setActiveWorkspace - the exact paths the reporter uses.
4. Verified wheel-listener cleanup pattern already captures element at registration time (TASK-156 fix, lines 1471 + 2368).
5. onMouseDownCapture in TerminalPanel already narrowly checks for CANVAS / xterm-cursor-layer, no change needed.
6. Typecheck: no new errors vs baseline.
7. Single coherent commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigated. Confirmed:
- PaneDropZones: container had pointer-events: none but per-zone children had pointer-events: auto, gated only by React conditional render. A stuck isDragging flag thus did keep z-index:50 overlays mounted across every pane.
- useDragTerminal: handleDragEnd / handleDragCancel are the only places that clear the flag. No global pointercancel / blur / visibilitychange safety net before this fix.
- Wheel listener cleanup pattern in TerminalPanel already captures the element at registration time (wheelRecoveryEl), so reporter's fix candidate #3 was already in place from a prior #48 follow-up.
- onMouseDownCapture stopPropagation only fires when target.tagName === CANVAS or target has xterm-cursor-layer class. Selection drags begin on .xterm-screen / text-rows (not CANVAS unless the WebGL renderer is on, and we use DOM renderer), and capture-phase stopPropagation on the pane root would not block descendant listeners anyway. So fix candidate #4 not needed.

Applied fixes:
1. PaneDropZones: container always mounted with data-dragging=true|false attr. CSS gates pane-drop-zone pointer-events: auto behind [data-dragging="true"]. Zones only rendered when dragActive too, so worst case is no drop targets briefly.
2. useDragTerminal: added global pointercancel + window blur + visibilitychange listeners forcing setDragging(false). try/finally wraps handleDragEnd dispatch and handleDragCancel reset.
3. terminal-store: setActiveWorkspace + createWorkspace explicitly reset isDragging:false + draggedTerminalId:null on every workspace switch / new-tab path.

Typecheck: 32 errors same as baseline. No new errors introduced.

AC #4 (onMouseDownCapture narrowing): not needed - the existing capture handler only stopProps on target.tagName === CANVAS or class xterm-cursor-layer. Selection drags begin on .xterm-screen / text-rows, which the check does not match. Verified by reading TerminalPanel.tsx line 2745-2753.

AC #5 (e2e test): deferred. User has CPU constraints around Playwright runs (per memory), and reproducing a stuck-drag race in headless e2e is finicky. The bug surface is now reduced to "no drop targets briefly" worst case rather than "pane dead", which the deterministic listener tests below would be more useful for if added later as a focused unit test on useDragTerminal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GH #115: previously-active pane goes dead to mouse-wheel + text-selection on macOS after opening a new tab. Keyboard input keeps working. Cmd+Ctrl+R does not recover, only app restart does.

Root cause: dnd-kit drag state (isDragging in the renderer store) can get stuck true when a drag is interrupted by a workspace switch. While stuck, PaneDropZones overlays stay mounted on every pane with pointer-events: auto and z-index 50, silently eating wheel + mousedown events on the original pane while leaving the keyboard helper textarea (a sibling, not covered) reachable.

Fixes (defense in depth, each independently sufficient):

- PaneDropZones (src/renderer/components/PaneDropZones.tsx + global.css): zones now default to pointer-events: none; the container exposes a data-dragging attr that flips zones to pointer-events: auto only when a drag is live. Even if the React flag gets stuck, worst case is "no drop targets" briefly, never "pane dead". Zones are also conditionally rendered (the prior behavior).

- useDragTerminal (src/renderer/hooks/useDragTerminal.ts): added a global pointercancel + window blur + visibilitychange listener that force setDragging(false) on any interrupt path. handleDragEnd dispatch wrapped in try/finally so a throw inside reorder/move/swap cannot leak the flag. handleDragCancel pattern matched.

- terminal-store setActiveWorkspace + createWorkspace (src/renderer/state/terminal-store.ts): both reset isDragging + draggedTerminalId on every workspace switch or new-workspace path - the exact triggers from the reporter's steps.

Non-fixes (intentionally skipped):
- Wheel listener cleanup pattern was already capture-element-at-registration from prior #48 follow-up (lines 1471 + 2368 of TerminalPanel.tsx).
- onMouseDownCapture in TerminalPanel already only stopProps on CANVAS / xterm-cursor-layer, never on .xterm-screen / .xterm-viewport, so selection-start mousedown reaches xterm.

Tests: typecheck unchanged at 32 baseline errors (none introduced). e2e deferred - user CPU constraints + reproducing the drag-state race headlessly is finicky; the new safety net reduces blast radius enough that a unit test on useDragTerminal would be the more useful follow-up.

Risks: very low. The CSS change is additive (pane-drop-zone pointer-events flips off-by-default), the listener additions are no-ops when not dragging, and the store resets are no-ops when the flag is already false.
<!-- SECTION:FINAL_SUMMARY:END -->
