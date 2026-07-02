---
id: TASK-241
title: Floating panels in inactive workspaces lose content on workspace switch
status: To Do
assignee: []
created_date: '2026-06-21 08:49'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-240. That fix keeps TILED workspace panes mounted/live across workspace switches (stacked layers in TilingLayout). Floating panels are rendered separately by FloatingLayer, which only reads the ACTIVE workspace's layout.floatingPanels, so a floating panel living in a non-active workspace still unmounts when you switch away and loses output produced while hidden (same class of bug TASK-240 fixed for tiled panes). Decide whether to keep all workspaces' floating panels mounted (hidden) the same way, or accept the limitation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A floating panel in workspace A keeps receiving and retaining PTY output while workspace B is active
- [ ] #2 Switching back to A shows the floating panel's current content without a manual resize
- [ ] #3 No regression to active-workspace floating panel behavior (drag, focus, dock)
<!-- AC:END -->
