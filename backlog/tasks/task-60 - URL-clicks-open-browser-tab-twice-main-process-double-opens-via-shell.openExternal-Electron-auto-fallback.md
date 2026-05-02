---
id: TASK-60
title: >-
  URL clicks open browser tab twice - main process double-opens via
  shell.openExternal + Electron auto-fallback
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-02 17:08'
updated_date: '2026-05-02 17:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-58, single clicks on plain URLs still launched two browser tabs. Diagnostics in main.ts showed setWindowOpenHandler fires exactly once per click and shell.openExternal is called once from our handler - yet two tabs opened. Isolation test (commenting out our shell.openExternal call) confirmed that another navigation handler in the stack still opens denied http(s) URLs externally on its own, so our explicit shell.openExternal was a duplicate. The TASK-58 e2e test only spied on window.open in the renderer (which correctly fired once), so the main-process double never registered. Fix removes the explicit shell.openExternal calls from both setWindowOpenHandler blocks (main window and detached windows). Non-HTTP protocols (mailto:, etc.) were never explicitly opened in the original code either, so behavior for those is unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single click on a plain URL opens exactly one browser tab
- [x] #2 Removed explicit shell.openExternal call from main-window setWindowOpenHandler in src/main/main.ts
- [x] #3 Removed explicit shell.openExternal call from detached-window setWindowOpenHandler in src/main/main.ts
- [x] #4 will-navigate handler still routes http(s) URLs explicitly (it doesn't get the auto-fallback Electron applies to setWindowOpenHandler deny)
- [x] #5 Regression test asserts main-process shell.openExternal is called 0 times when our handler runs (anything more means an explicit call snuck back in)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Empirical isolation test (commenting shell.openExternal in main's setWindowOpenHandler) confirmed 1 tab still opens, proving another navigation handler in the stack is opening denied http(s) URLs.
- Removed the explicit shell.openExternal call from main-window setWindowOpenHandler (src/main/main.ts:303-306) and detached-window setWindowOpenHandler (src/main/main.ts:631-633).
- Kept the will-navigate handler's shell.openExternal: that path doesn't get the same auto-fallback (different navigation type) and is a defensive fallback for in-frame navigations.
- Added regression spec tests/e2e/task-60-url-no-double-open-in-main.spec.ts that wraps shell.openExternal in main via app.evaluate and asserts the count stays at 0 for plain http URL clicks. This catches re-introduction of the explicit call.

- Strengthened the regression test with a second assertion: setWindowOpenHandler must fire exactly ONCE per click (proves the click reached main and the URL was processed). Without this, a count of 0 on shell.openExternal could mean "test passes because click was silently dropped" rather than "no duplication". Now the spec verifies both directions: behavior still works AND no duplicate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the duplicate shell.openExternal call from setWindowOpenHandler in src/main/main.ts.

Root cause:
- TASK-58 fixed double-fire at the renderer link-provider layer but a second source of duplication lived in main: setWindowOpenHandler returned {action: 'deny'} AND we also called shell.openExternal(url). Empirically, another navigation handler in the stack already opens denied http(s) URLs externally on its own, so the explicit call was a duplicate, producing two browser tabs per click.
- The TASK-58 e2e spec only spied on window.open in the renderer (which correctly fired once), so the main-process double never registered.

Changes:
- src/main/main.ts: removed the explicit shell.openExternal(url) call from both main-window and detached-window setWindowOpenHandler. The will-navigate handler's explicit call is preserved (different navigation type, no auto-fallback).
- tests/e2e/task-60-url-no-double-open-in-main.spec.ts: new regression spec that wraps shell.openExternal in main via app.evaluate() and asserts the explicit-call count stays at 0 for a plain http URL click. If a future change re-adds the explicit call, this assertion fires and points the reviewer at the duplication risk.

Non-HTTP protocols (mailto:, ftp:, etc.) were never explicitly opened in the original code either — behavior for those is unchanged.

User impact: single click on a URL in any tmax terminal opens exactly one browser tab (verified manually in dev mode).

Tests:
- New: tests/e2e/task-60-url-no-double-open-in-main.spec.ts
- Existing TASK-58 specs continue to assert renderer-side single-fire.
<!-- SECTION:FINAL_SUMMARY:END -->
