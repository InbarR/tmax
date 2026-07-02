---
id: TASK-240
title: Terminal panes render blank after switching back to a workspace until resized
status: Done
assignee:
  - '@mpmisha'
created_date: '2026-06-21 07:18'
updated_date: '2026-06-21 08:49'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When switching away from a workspace and back, the workspace's terminal pane(s) appear empty. Dragging a split border (any resize) forces a re-render and the content reappears. Reproduces even with a single pane.

Root cause: App renders a single <TilingLayout/> bound to the active workspace's layout.tilingRoot. Switching workspaces swaps the layout, unmounting the previous workspace's TerminalPanels and remounting them on return. The only thing preserving content across that remount is the renderer-side buffer cache (terminal-buffer-cache.ts), which auto-expires entries after 10s. If the user spends >10s in another workspace, the cached buffer expires and the pane remounts with an empty xterm buffer. Resizing fires resizePty (SIGWINCH), making the running program redraw - which is why content 'comes back' on resize.

The 10s TTL assumes remount happens within one React render cycle (true for split/float/grid reshapes) but is wrong for workspace switching, where remount only happens when the user returns - arbitrarily later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching away from a workspace for more than 10s and back restores all terminal pane content without needing a manual resize
- [x] #2 Reproduces/fixed for both single-pane and multi-pane workspaces
- [x] #3 Existing split / float-dock / grid-rebuild / refresh-pane buffer restore behavior is unaffected
- [x] #4 Output produced while a workspace is hidden is present on switch-back (panes stay mounted/live, not just restored from a pre-switch snapshot)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. terminal-buffer-cache.ts: remove the aggressive 10s TTL (the actual bug). Add dropTerminalBuffer(id) for explicit eviction; keep setBufferCacheExpiry test hook but default expiry to disabled.
2. TerminalPanel.tsx unmount cleanup: only saveTerminalBuffer when the terminal still exists in the store (alive=hide -> save; gone=closed -> skip + drop). Prevents orphaned entries now that there is no TTL.
3. terminal-store.ts: call dropTerminalBuffer(id) in closeTerminal and closeWorkspace so buffers for terminals killed while not mounted are evicted.
4. Build (npm run build / tsc) + run a targeted check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Option 1 (targeted cache fix), confirmed root cause live in dev build:
- pty.resize() only delivers SIGWINCH on an actual size change, so a remount at unchanged dims never makes the program redraw; with the 10s snapshot TTL expired, the pane stayed blank until a manual border-drag changed the size.

Changes:
- terminal-buffer-cache.ts: default expiry disabled (0 = no TTL); snapshots persist until popped or explicitly dropped. Added dropTerminalBuffer(). setBufferCacheExpiry retained for tests.
- TerminalPanel.tsx: unmount cleanup only saves a snapshot when the terminal is still in the store (hide/reparent), and drops it when the terminal is gone (genuine close) - prevents orphans now that there is no TTL.
- terminal-store.ts: dropTerminalBuffer(id) in closeTerminal and closeWorkspace to evict snapshots for terminals killed while not mounted.

Cleanup pass (post-verification):
- Reverted intermediate Option-1 buffer-cache changes (terminal-buffer-cache.ts, TerminalPanel.tsx, terminal-store.ts) - unnecessary once panes no longer unmount on workspace switch.
- Tightened comments; raised IPC listener cap (setMaxListeners 2000) since all panes now mount at once.
- Preserved TASK-117 no-empty-state-flash: active empty layer shows SessionLoading while restoring, EmptyState otherwise.
- Added e2e regression test (inactive workspace panes stay mounted across a switch).
- e2e suite is Windows-only (fixture hardcodes tmax-win32-x64/tmax.exe); validated new test + changed sources parse via esbuild; existing single-workspace specs use >= N panel-count assertions + class selectors so the extra layer wrapper does not affect them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix workspace panes rendering blank/stale after switching back.

Problem: App rendered a single <TilingLayout/> bound to the active workspace, so switching workspaces unmounted the previous workspace's TerminalPanels and disposed their xterm instances. PTY output produced while hidden was dropped, and the pane came back blank/stale until a manual resize fired SIGWINCH and the running app (e.g. Copilot CLI) redrew.

Fix (Option B - keep panes alive): render every workspace's tiling tree as a stacked, absolutely-positioned layer in .layout-area (active visible, inactive visibility:hidden but still sized & rendering) and mount portals for ALL terminals via the existing TASK-158 host system. Each xterm keeps consuming its PTY while hidden, so switching back is instant and current - no resize, nothing lost.

Changes:
- TilingLayout.tsx: per-workspace stacked layers; portals + host GC over all terminals; active-empty layer shows SessionLoading (restoring) / EmptyState.
- global.css: .tiling-ws-layer (+ .inactive).
- preload.ts: ipcRenderer.setMaxListeners(2000) - per-terminal IPC listeners now scale with total terminal count.
- tests/e2e/workspaces.spec.ts: regression test asserting inactive-workspace panes stay mounted across a switch.

Verified live by the user. Follow-up filed for floating panels in inactive workspaces (still unmount on switch; Option B scoped to tiled panes).
<!-- SECTION:FINAL_SUMMARY:END -->
