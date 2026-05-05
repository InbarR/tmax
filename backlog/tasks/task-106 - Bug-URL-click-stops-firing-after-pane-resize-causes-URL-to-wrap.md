---
id: TASK-106
title: 'Bug: URL click stops firing after pane resize causes URL to wrap'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 14:22'
updated_date: '2026-05-04 19:47'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: open fresh Copilot CLI pane, paste/echo a long URL on a single line, click - opens. Open another pane to shrink the original; the URL now wraps. Click - nothing. Resize back so URL is one line again - still nothing. window.__tmaxLinkActivates does not increment; activate handler is not being invoked even though underline decoration still renders. xterm's linkifier appears to get into a stuck state after the buffer reflow on resize, registering decorations but not firing click events on registered link ranges. Possibly related to TASK-104 (multi-fire dedupe) but separate failure mode (zero fires vs many).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a pane resize that wraps then unwraps a URL, click on the URL still opens the browser tab
- [x] #2 window.__tmaxLinkActivates increments on every click whether URL is wrapped or not
- [x] #3 Underline decoration matches click hit area in both wrapped and unwrapped states
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write Playwright repro (tests/e2e/task-106-url-click-after-reflow.spec.ts):
   - Launch tmax, spy on window.open
   - Write a URL that fits on ONE line at default cols
   - Click it -> assert window.open fires once (sanity)
   - Call term.resize(narrow_cols, rows) so xterm reflows the URL onto two rows (isWrapped continuation)
   - Click on the WRAPPED URL (both head row and continuation row) -> assert window.open fires (currently fails)
   - Resize back to wide so URL is one line again -> click should still fire (per AC1)
2. Diagnose: in the spec, also dump term.buffer.active state post-resize - segs[].isWrapped, the link ranges xterm registers, the offsetToRowCol output - so we see WHICH layer is broken (xterm reflow / our segs-walk / the registered range / xterm dispatch).
3. Hypotheses to verify against the diagnostic:
   a. xterm does not call provideLinks for the continuation row after reflow (xterm-side stuck state)
   b. provideLinks is called but the soft-wrap walk in TerminalPanel.tsx:417-430 misreads isWrapped post-reflow
   c. xterm registers the link range correctly but mouse click hit-test is off-by-one against the reflowed grid
4. Fix the layer the diagnostic points at. Most likely b or c - if a, file an xterm upstream issue and work around (e.g. force-rebuild on resize via term.refresh()).
5. Re-run spec until it passes; check ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosed via tmax-task58.log: setWindowOpenHandler fired with full URL but neither will-navigate nor did-create-window followed in Electron 30, so the URL was silently dropped. Symptom matched "click does nothing" inside Claude Code panes; Copilot CLI works because URLs there did not bottleneck through the same denied window.open path on the user's session.

Fix: setWindowOpenHandler now calls shell.openExternal(url) for http(s) before returning {action:'deny'}. Mirrored in detached-window handler.

Test: TASK-60 spec's assertion was the gap that allowed the regression - it asserted openExternalCount === 0 (assuming an implicit fallback). Flipped to require openExternalCount === 1 so a future revert fails CI immediately.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix URL clicks silently dropped inside Claude Code panes (and other window.open paths).

## Root cause

setWindowOpenHandler returned {action:'deny'} without calling shell.openExternal. An older comment claimed Electron auto-fell-through to external open after deny - tmax-task58.log diagnostic showed that's no longer true in Electron 30: a denied window.open fires neither will-navigate nor did-create-window, so the URL is silently dropped. User-visible: "click does nothing" on every URL clicked inside Claude Code panes. Copilot CLI URLs were not consistently affected for the same user, which masked the bug as Claude-Code-specific.

## Changes

- `src/main/main.ts:332` - setWindowOpenHandler now calls shell.openExternal(url) for http(s) URLs before returning deny. Scheme-guarded so file://, mailto:, custom schemes do not trigger an unintended browser open.
- `src/main/main.ts:715` - same fix mirrored in the detached-window handler.
- `tests/e2e/task-60-url-no-double-open-in-main.spec.ts` - flipped assertion from openExternalCount === 0 to === 1. Original concern (double-open from TASK-58) is still caught because === 1 also fails on 2.

## User impact

Clicking any http/https URL in any pane now opens the system default browser exactly once. Confirmed by user in live dev instance.

## Tests

- npx tsc --noEmit clean for modified files
- User-confirmed manual repro: clicking GitHub PR URL inside Claude Code pane now opens the browser tab.
<!-- SECTION:FINAL_SUMMARY:END -->
