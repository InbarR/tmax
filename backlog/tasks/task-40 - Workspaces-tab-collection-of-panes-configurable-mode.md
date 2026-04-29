---
id: TASK-40
title: 'Workspaces: tab = collection of panes (configurable mode)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-04-28 20:13'
updated_date: '2026-04-28 20:14'
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
- [ ] #1 Internal model: workspaces Map<id, Workspace> with per-workspace tilingRoot + floatingPanels; activeWorkspaceId; terminals carry workspaceId
- [ ] #2 Migration: existing session.json with single layout becomes one default workspace transparently
- [ ] #3 Settings toggle: config.tabMode='flat' (default) preserves today's behaviour; config.tabMode='workspaces' switches the tab bar to render workspace chips
- [ ] #4 Workspaces UI: new tab = new workspace + one fresh terminal; close last pane closes the workspace; rename workspace via right-click; click chip switches activeWorkspaceId
- [ ] #5 Persistence: workspaces saved/restored via session.json; activeWorkspaceId persisted
- [ ] #6 Keyboard: Ctrl+1..9 switches workspaces (workspaces mode only); Ctrl+Shift+] / Ctrl+Shift+[ next/prev workspace
- [ ] #7 Playwright spec covers: flat-mode unchanged behavior; workspaces-mode chips swap grids; migration from flat session.json
<!-- AC:END -->
