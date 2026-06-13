---
id: TASK-165
title: >-
  Detached window title bar should mirror the real pane header (title + color),
  not a generic label
status: To Do
assignee:
  - '@inrotem'
created_date: '2026-06-12 10:18'
updated_date: '2026-06-13 13:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-159. The detached window now has a title bar (ClawPilot) but shows a generic 'Detached terminal' label and themed-only chrome, instead of the in-grid pane header's real title (e.g. 'GitHub Copilot') and pane color. Root: DetachedApp is a minimal store-less renderer, so it lacks the store-derived title + tab/group/workspace/default color tint. Fix: at detach time the store (which has computeTabTint) snapshots the pane title + computed titleBg and passes them to the detached window via the existing detachedTerminalId URL-query channel; DetachedApp renders them. Snapshot at detach (no live re-sync) is acceptable for v1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Detached window title bar shows the pane's real title (matches the in-grid header), falling back to the xterm/process title only when no store title exists
- [ ] #2 Detached title bar background reflects the pane's effective color (tab/group/workspace/default) using the same tint as the in-grid header
- [ ] #3 Reattach control still works; covered by an e2e test asserting the detached title bar shows the real title
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parked - lower-priority enhancement. Detached window already has a working (generic) title bar + reattach (TASK-159). Resume to plumb the real pane title+color over IPC (snapshot at detach via the detachedTerminalId URL query).
<!-- SECTION:NOTES:END -->
