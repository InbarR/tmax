---
id: TASK-258
title: 'Review/merge PR #137 - workspace panes render blank after switching back'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-22 06:29'
updated_date: '2026-08-05 06:56'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External contributor PR (mpmisha). Switching workspaces unmounted the previous workspace's TerminalPanels and disposed their xterm instances, so PTY output produced while hidden was dropped and the pane came back blank/stale until a manual resize. Fix renders every workspace's tiling tree as a stacked absolutely-positioned layer (active visible, inactive visibility:hidden but still sized & rendering) and mounts portals for ALL terminals via the TASK-158 host system, so each xterm keeps consuming its PTY. Touches TilingLayout.tsx, global.css, preload.ts (setMaxListeners 2000), workspaces.spec.ts. Reviewed: architecturally sound, well-documented. BLOCKER for merge: the PR also carries the contributor's own task-240/task-241 .md files which COLLIDE with our TASK-240/241 IDs - merge code-only (cherry-pick TilingLayout/global.css/preload/spec, drop the two task files), like PR #136's stats cruft. Other notes: all-workspaces-always-rendering is a resource tradeoff; setMaxListeners(2000) is pragmatic but high; author couldn't run the Windows-only e2e and our CI Playwright is red (TASK-251) - run workspaces.spec.ts locally before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PR #137 merged/closed on GitHub
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #137 was reviewed and intentionally closed without merge because its task files collided with existing IDs and the proposed always-mounted workspace approach carried unnecessary resource/listener tradeoffs. User confirmed on 2026-08-05 that this review task is closed/superseded; implementation-specific criteria were removed rather than marked as shipped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reviewed PR #137 and closed it without merge. The proposed workspace mounting change was not shipped; the review task is complete as an intentional close/supersede decision.
<!-- SECTION:FINAL_SUMMARY:END -->
