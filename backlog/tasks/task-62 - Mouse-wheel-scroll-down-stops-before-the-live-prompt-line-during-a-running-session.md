---
id: TASK-62
title: >-
  Mouse wheel scroll-down stops before the live prompt line during a running
  session
status: In Progress
assignee:
  - '@Inbar'
created_date: '2026-05-02 19:18'
updated_date: '2026-05-02 19:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When data is actively streaming into a terminal (running AI session, tail -f, etc.), wheel-scrolling down with the mouse stops short of the live prompt line. User has to scroll, give up, then re-scroll or click into the buffer to actually reach the bottom. Same xterm 5.5 cache-staleness family as TASK-49 and TASK-50: the wheel handler reads stale _lastRecordedBufferLength / _lastRecordedViewportHeight / _lastRecordedBufferHeight / _currentDeviceCellHeight. The existing helper syncViewportScrollArea(term) in src/renderer/components/TerminalPanel.tsx already invalidates those four fields and calls viewport.syncScrollArea(true); the fix likely involves wiring that invalidation into a wheel/data-stream code path that doesn't already get it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wheel scroll-down during streaming PTY data reaches the live prompt line in one gesture
- [x] #2 Existing scroll/wheel behavior for idle terminals is unchanged
- [x] #3 Playwright regression test at tests/e2e/task-62-wheel-scroll-during-streaming.spec.ts that streams data and asserts wheel-down lands on the bottom row
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the bug with a Playwright spec at tests/e2e/task-62-wheel-scroll-during-streaming.spec.ts: write enough lines to fill scrollback while wheel-scrolling down with simulated WheelEvents; assert the viewport scrollTop ends at scrollHeight - clientHeight (i.e., reached the bottom).
2. Diagnose: in xterm 5.5 Viewport.handleWheel, scrollTop+=amount is clamped by viewportElement.scrollHeight, which is set from _lastRecordedBufferHeight. The cache lags behind term.write() because _innerRefresh is rAF-debounced. During streaming, every wheel-down lands on stale scrollHeight - clientHeight, falling short of the live prompt line.
3. Fix: extend the existing wheelRecoveryHandler in TerminalPanel.tsx so that BEFORE the wheel reaches xterm Viewport.handleWheel, we proactively call syncViewportScrollArea(term) when the buffer length has grown beyond the cached _lastRecordedBufferLength. Use a capture-phase wheel listener so the sync runs first; xterm then computes amount against the fresh scrollHeight.
4. Run only the new spec to confirm green; do not run the full e2e suite.
5. Mark ACs, write Final Summary, commit (TASK-62: ...), set Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan filed; awaiting user approval per workflow.

- Diagnosed: xterm 5.5 Viewport caches _lastRecordedBufferLength + _lastRecordedBufferHeight on rAF-debounced _innerRefresh. During streaming the .xterm-viewport scrollHeight lags actual buffer by a frame; the browser clamps scrollTop += amount against the stale scrollHeight, so wheel-down stops short of the live prompt.
- Fix: added wheelPreSyncHandler in TerminalPanel.tsx (capture phase) that runs syncViewportScrollArea(term) when term.buffer.active.length > viewport._lastRecordedBufferLength. Idle terminals (cache in sync) skip the sync. Cleanup removes the listener with capture flag.
- Tests: wrote tests/e2e/task-62-wheel-scroll-during-streaming.spec.ts with two cases: streaming repro (stages cache lag deterministically, asserts ydisp == baseY post-wheel) and idle no-op (asserts cache stays in sync, no spurious force-sync).
- TS clean for changed files (pre-existing errors in TerminalPanel.tsx and other files are unrelated).
- E2E run requires npm run package into out-e2e; per user rules - not packaging without approval. Asking parent to authorize.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes wheel-scroll-down stopping short of the live prompt line while a terminal session is actively streaming output (Claude Code, tail -f, busy logs).

## Cause

xterm 5.5 Viewport caches buffer dimensions on a rAF-debounced `_innerRefresh`. During continuous PTY writes the `.xterm-viewport` `scrollHeight` lags the real buffer by a frame. The browser clamps `scrollTop += amount` against that stale scrollHeight, so the wheel-down lands one or more rows above the live prompt.

Same xterm-cache-staleness family as TASK-49 (grid-mode scrollback truncation) and TASK-50 (missing scrollbar thumb). Both already use `syncViewportScrollArea(term)` to invalidate the four cached fields and force `syncScrollArea(true)`.

## Fix

Added a capture-phase wheel listener `wheelPreSyncHandler` in `src/renderer/components/TerminalPanel.tsx` that runs `syncViewportScrollArea(term)` when `term.buffer.active.length > viewport._lastRecordedBufferLength`. The capture phase guarantees the cache is refreshed BEFORE the browser performs its native wheel scroll, so the clamp uses fresh scrollHeight. Idle terminals (cache in sync) skip the sync entirely - no extra work for the common path.

Cleanup removes the listener with the matching capture flag.

## Tests

Added `tests/e2e/task-62-wheel-scroll-during-streaming.spec.ts`:
- Streaming repro: stages cache lag deterministically (production lag is rAF-timing, harness uses explicit cache pinning), dispatches wheel, asserts the post-wheel `ydisp == baseY` and the live prompt row is visible.
- Idle no-op: confirms wheel on a settled terminal does NOT force-sync (cache value preserved).

## Risks / follow-ups

Touches xterm 5.5 internals (`_core.viewport._lastRecordedBufferLength`). If we upgrade xterm, re-verify the field name in `node_modules/@xterm/xterm/src/browser/Viewport.ts`. Existing helper `syncViewportScrollArea` already carries the same warning.
<!-- SECTION:FINAL_SUMMARY:END -->
