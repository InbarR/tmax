---
id: TASK-40
title: 'Workspaces: tab = collection of panes (configurable mode)'
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 20:13'
updated_date: '2026-04-29 07:12'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per request 2026-04-28: introduce workspaces. Each tab represents a collection of panes ("workspace"); switching tabs swaps the entire grid. Configurable via settings - default keeps today's flat tab-per-terminal behaviour, opt-in to workspace mode for project-style grouping.

Mental model:
- Workspace = { id, name, tilingRoot, floatingPanels }
- Terminal belongs to exactly one workspace via workspaceId
- Pane title-bar already shows pane identity, so workspaces only need to swap the grid

Migration:
- Existing flat layout becomes the single default workspace.
- Tab mode setting (config.tabMode = "flat" | "workspaces") gates the UI; data model is always workspaces internally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Internal model: workspaces Map<id, Workspace> with per-workspace tilingRoot + floatingPanels; activeWorkspaceId; terminals carry workspaceId
- [x] #2 Migration: existing session.json with single layout becomes one default workspace transparently
- [x] #3 Settings toggle: config.tabMode='flat' (default) preserves today's behaviour; config.tabMode='workspaces' switches the tab bar to render workspace chips
- [x] #4 Workspaces UI: new tab = new workspace + one fresh terminal; close last pane closes the workspace; rename workspace via right-click; click chip switches activeWorkspaceId
- [x] #5 Persistence: workspaces saved/restored via session.json; activeWorkspaceId persisted
- [x] #6 Keyboard: Ctrl+1..9 switches workspaces (workspaces mode only); Ctrl+Shift+] / Ctrl+Shift+[ next/prev workspace
- [x] #7 Playwright spec covers: flat-mode unchanged behavior; workspaces-mode chips swap grids; migration from flat session.json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resumed after stash recovery (parallel session had stashed feature/workspaces wip + switched to main, and the stash also nuked CommandPalette.tsx which was unrelated). Restored only the TASK-40 files from the stash blob in a worktree at C:\projects\tmax-workspaces (branch feature/workspaces-restore), re-applied CommandPalette workspace commands manually.

Closed AC #6 gap: added Ctrl+1..9 -> goToWorkspace1..9 (gated on tabMode=workspaces). Removed unsafe Ctrl+Tab/Ctrl+Shift+Tab dupes that conflicted with pane focusNext/focusPrev (was a TS1117 duplicate-key error).

Closed AC #7 gap: added migration spec that pre-seeds a legacy tmax-session.json (no workspaces array) via a new launchTmax({preSeed}) hook and asserts the legacy terminals end up in exactly one workspace with their workspaceId set.

createWorkspace now calls saveSession() so a crash before next mutation doesn't lose the new (empty) workspace.

All 8 e2e tests pass (npm run package -> out-next; TMAX_E2E_OUT_DIR=out-next npx playwright test workspaces.spec.ts). Build clean. Committed as 08424ec on feature/workspaces-restore.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workspaces: each tab is a collection of panes (configurable mode).

What changed
- Renderer state now models Workspace = { id, name, color?, layout: { tilingRoot, floatingPanels } }. Terminals carry workspaceId; reconcileGridLayout filters by it so a workspace switch never drags foreign terminals into the visible grid.
- session.json gains workspaces[] + activeWorkspaceId. Legacy flat sessions (just tree/floating) are wrapped into one default workspace on load. createWorkspace persists eagerly so a crash before the next mutation doesn't lose the new (empty) workspace.
- New WorkspaceTabBar component (chips, +, rename via right-click / double-click, close with last-workspace guard). App picks WorkspaceTabBar vs the existing TabBar based on config.tabMode.
- Command palette gains: Tabs: Flat / Workspaces toggle, Workspace: New / Next / Previous.
- Keybindings (active only in workspaces mode; no-op when there is one workspace): Ctrl+Shift+] / Ctrl+Shift+[ next/prev, Ctrl+1..9 jump to workspace N. Ctrl+Tab / Ctrl+Shift+Tab were intentionally NOT remapped — they remain pane focusNext/focusPrev because pane cycling is more frequent.

Tests
- tests/e2e/workspaces.spec.ts: 8 tests covering default state, create/switch, pane isolation across workspaces, close + successor, last-workspace guard, tabMode bar swap, rename, and migration from a pre-seeded legacy session.json.
- tests/e2e/fixtures/launch.ts: new optional preSeed(userDataDir) hook used by the migration test.
- All 8 pass against the packaged build.

Risks / follow-ups
- Workspace color is in the model but not yet exposed in UI.
- The migration assumes electron-store's serialization key is literally 'session' at the root of tmax-session.json — verified against main.ts SESSION_SAVE.
<!-- SECTION:FINAL_SUMMARY:END -->
