---
id: TASK-258
title: 'Review/merge PR #137 - workspace panes render blank after switching back'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-22 06:29'
updated_date: '2026-06-22 06:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External contributor PR (mpmisha). Switching workspaces unmounted the previous workspace's TerminalPanels and disposed their xterm instances, so PTY output produced while hidden was dropped and the pane came back blank/stale until a manual resize. Fix renders every workspace's tiling tree as a stacked absolutely-positioned layer (active visible, inactive visibility:hidden but still sized & rendering) and mounts portals for ALL terminals via the TASK-158 host system, so each xterm keeps consuming its PTY. Touches TilingLayout.tsx, global.css, preload.ts (setMaxListeners 2000), workspaces.spec.ts. Reviewed: architecturally sound, well-documented. BLOCKER for merge: the PR also carries the contributor's own task-240/task-241 .md files which COLLIDE with our TASK-240/241 IDs - merge code-only (cherry-pick TilingLayout/global.css/preload/spec, drop the two task files), like PR #136's stats cruft. Other notes: all-workspaces-always-rendering is a resource tradeoff; setMaxListeners(2000) is pragmatic but high; author couldn't run the Windows-only e2e and our CI Playwright is red (TASK-251) - run workspaces.spec.ts locally before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Code cherry-picked to main WITHOUT the colliding task-240/241 .md files
- [ ] #2 workspaces.spec.ts regression test passes locally on our build
- [ ] #3 PR #137 merged/closed on GitHub
<!-- AC:END -->
