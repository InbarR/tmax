---
id: TASK-135
title: >-
  Feature: sort AI sessions list by time (cross-folder) and folder groups
  alphabetically
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-07 09:56'
updated_date: '2026-05-08 08:31'
labels:
  - enhancement
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two related sort improvements for the AI Sessions panel (CopilotPanel.tsx):\n\n1. **Time sort across folders** - add a sort mode that orders sessions by lastActivityTime regardless of repo grouping. Today, when groupByRepo is on (the default for many users), recent sessions are scattered under their repo headers and you have to scan each group to find the most-recent one. A 'sort by time' toggle would flatten the list (or sort group headers by their newest member) so the freshest session is always on top. Both directions (newest-first / oldest-first).\n\n2. **Alphabetical folder groups** - when groupByRepo is on, today the groups are ordered by most-recent activity within each group (CopilotPanel.tsx:333-355). Add an alternate ordering that sorts the group headers (TMAX, CLAWPILOT, BACKLOG-HUB, ...) alphabetically. Useful when scanning for a specific repo by name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 User can switch the sessions list between 'group by repo' and 'sort by time' (newest-first)
- [x] #2 Time-sort respects pinned sessions (still rise to top) and lifecycle tabs
- [x] #3 When grouped by repo, the user can choose alphabetical group order in addition to the current activity-based order
- [x] #4 Selected sort mode persists across tmax restarts (per-user setting, like other CopilotPanel toggles)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add two persisted settings via existing electron-store + updateConfig pattern (no AppConfig schema change required; values are read via (config as any)):
   - aiSessionListSortMode: activity (default) | time-desc | time-asc
   - aiGroupByRepoOrder: activity (default) | alpha
2. CopilotPanel.tsx: read both values from config; expose two new menu items in the existing header overflow (⋯):
   - Sort: by activity / newest first / oldest first - cycle item, click cycles
   - Group order: by activity / alphabetical - cycle item, only shown when groupByRepo is on
3. Apply sort in displayList useMemo:
   - When sort mode is time-desc or time-asc: bypass groupByRepo reorder. Flat list sorted by lastActivityTime; pinned still rise to top.
   - When sort mode is activity AND groupByRepo on AND order is alpha: sort group entries by case-insensitive group key (PINNED stays top, no-repo stays bottom). Inner order unchanged.
   - Default behavior unchanged.
4. Run npx tsc --noEmit. Commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in src/renderer/components/CopilotPanel.tsx and src/main/config-store.ts.
- Added SortMode + GroupOrder types and persisted via existing updateConfig pattern (aiSessionListSortMode, aiGroupByRepoOrder).
- sortSessions extended with sortMode param. time-desc/time-asc keep pinned at top.
- displayList bypasses groupByRepo reorder when sortMode is time-*. When activity+alpha, sorts group keys alphabetically (PINNED on top, no-repo on bottom preserved).
- Added two cycle items in the existing header overflow menu (⋯): Sort: by activity / newest first / oldest first; Group order: by activity / alphabetical (only shown when group+activity).
- Suppressed group headers and collapse-all toggle when in time-sort mode.
- npx tsc --noEmit clean for changed files (only pre-existing errors remain).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added two persisted user settings to the AI Sessions panel so users can scan their list across repos by time, or alphabetize repo groups, without losing the existing default behavior.

Changes
- src/main/config-store.ts: documented two new optional AppConfig fields - aiSessionListSortMode ('activity' | 'time-desc' | 'time-asc') and aiGroupByRepoOrder ('activity' | 'alpha').
- src/renderer/components/CopilotPanel.tsx: read both keys from config; cycle/toggle via two new items in the existing header overflow menu (⋯):
  - Sort: by activity / newest first / oldest first (cycles in place)
  - Group order: by activity / alphabetical (only shown when grouping is on and sort is by activity, since time-sort flattens the list)
  sortSessions() now takes a sortMode; pinned still float to the top in all modes. displayList bypasses the group reorder for time-sort. Group headers and the collapse-all chevron are hidden in time-sort to match the flattened list.

Why
With groupByRepo on (the common default) the freshest session is buried somewhere inside one of N repo groups. The new toggles let users (1) flatten across folders to see what they touched last, and (2) alphabetize the repo headers when scanning by name.

User impact
- Default behavior unchanged.
- New: cycle "Sort: by activity / newest first / oldest first" from the ⋯ menu.
- New: when grouped by repo, "Group order: by activity / alphabetical".
- Both choices persist across tmax restarts (electron-store).

Tests
- npx tsc --noEmit: no new errors in changed files (~30 pre-existing errors elsewhere left as-is).
- Manual verification deferred to user (no e2e suite kicked off per project memory).
<!-- SECTION:FINAL_SUMMARY:END -->
