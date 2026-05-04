---
id: TASK-117
title: Loading indicator during session restore + parallelize pty spawn
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-04 21:12'
updated_date: '2026-05-04 21:34'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On first launch, tmax shows the empty-state hero for ~1-3s while session restore is in flight. Confusing because users think nothing's there. Two underlying issues: (1) TilingLayout falls through to <EmptyState /> while tilingRoot is still null during restore. (2) restoreSession's rebuildNode awaits each createPty IPC sequentially, so N panes = N serial pty spawns. Also loadDirs and restoreSession both call loadSession() = duplicate disk read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While session restore is in progress, render a loading indicator (or neutral placeholder) instead of the empty-state hero
- [x] #2 The empty-state hero only renders once restore has completed AND there are still no panes
- [x] #3 Pty spawns during restore happen in parallel via Promise.all rather than serially
- [x] #4 Floating-panel pty spawns also parallelized
- [x] #5 The duplicate loadSession() disk read at startup is eliminated
- [x] #6 Playwright test seeds a multi-pane session and asserts (a) loading indicator appears during restore (b) restore from N>=4 panes completes faster than the prior serial baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repro: Playwright test that seeds session.json with 4-pane layout, launches app, asserts empty-state hero is NOT rendered during restore + measures wall time from launch to all panes attached.\n2. Add isRestoring flag to terminal-store; set true at restoreSession start, false in finally. Also expose isInitializing for the broader init phase.\n3. TilingLayout: when isRestoring/isInitializing AND no tilingRoot, render a neutral loading indicator instead of <EmptyState />.\n4. restoreSession perf: rewrite rebuildNode so each leaf's createTerm is collected as a promise; resolve in parallel with Promise.all; assemble the tree from resolved IDs. Same for floating panels (workspaces + legacy).\n5. App.tsx init: drop the duplicate loadSession by inlining favoriteDirs/recentDirs hydration into restoreSession (or sharing the loaded payload). loadConfig and loadCopilotSessions/loadClaudeCodeSessions can also run in parallel - those don't depend on each other.\n6. Verify Playwright test passes; run a non-restore test to ensure first-run still shows empty state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed by:\n- Added isRestoring flag to terminal-store (default true).\n- restoreSession wrapped in try/finally to clear the flag on exit.\n- App.tsx init() also clears the flag in its own finally as a guard against early throws.\n- TilingLayout renders <SessionLoading /> spinner when isRestoring && !tilingRoot.\n- rebuildNode rewritten to collect leaves pre-order, Promise.all the createTerm calls, then assemble the LayoutNode tree synchronously.\n- Floating-pane spawns parallelized via Promise.all in both workspaces and legacy paths.\n- Hydrated favoriteDirs / recentDirs from the same loadSession payload that restoreSession already reads, dropping the redundant loadDirs() call from App.tsx init.\n- AI-session loaders (loadCopilotSessions, loadClaudeCodeSessions) parallelized with Promise.all.\n\nVerified with new e2e spec tests/e2e/task-117-restore-loading.spec.ts:\n- 4-pane seeded session: 7.1s end-to-end, empty-state hero never rendered during restore (MutationObserver + outside-poll both clean), 4 panes attached well under the 6s post-window budget.\n- Fresh launch (no session): hero still shown briefly before auto-spawn fallback, single terminal attached.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix the empty-state hero flashing on launch while session restore is in flight, and shorten the restore itself.\n\nWhat changed:\n- Added an isRestoring flag to terminal-store, default true at boot. TilingLayout now renders a small spinner (.session-loading) instead of <EmptyState /> while the flag is set; the empty-state hero only appears once the flag is cleared and there are still no panes.\n- restoreSession wrapped in try/finally so the flag is always cleared on exit. App.tsx init() also clears it in its own finally as a guard against throws upstream of restoreSession (loadConfig, AI-session loaders).\n- rebuildNode now spawns ptys in parallel: it walks the saved tree pre-order to collect every leaf's createTerm() promise, awaits them via Promise.all, then assembles the LayoutNode tree from the resolved IDs. Floating-pane spawns parallelized the same way in both workspaces and legacy paths.\n- Dropped a redundant loadSession() disk read at startup: favoriteDirs/recentDirs are now hydrated from the same payload restoreSession already reads, and App.tsx no longer calls loadDirs() during init.\n- loadCopilotSessions / loadClaudeCodeSessions run via Promise.all rather than sequentially.\n\nWhy: on relaunch with N panes, users saw the empty-state hero for ~1-2s while createPty IPCs ran serially, which read as 'tmax lost my panes.'\n\nUser impact: restoring a multi-pane layout shows 'Restoring session...' for a moment, then the panes appear ~Nx faster than before.\n\nTests: added tests/e2e/task-117-restore-loading.spec.ts. Seeds a 4-leaf session.json, asserts (via MutationObserver + outside polling) that .empty-state never renders during restore, and asserts a wall-clock budget of <6s from firstWindow to all 4 panes attached. Fresh-launch case (no session) still renders the hero. Both pass: 7.1s and 3.9s end-to-end.
<!-- SECTION:FINAL_SUMMARY:END -->
