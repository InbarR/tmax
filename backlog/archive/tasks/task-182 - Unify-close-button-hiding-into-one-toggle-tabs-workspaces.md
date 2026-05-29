---
id: TASK-182
title: Unify close-button hiding into one toggle (tabs + workspaces)
status: Done
assignee: []
created_date: '2026-05-29 09:10'
updated_date: '2026-05-29 09:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Superseded community PR #120 (separate 'Hide workspace close buttons' setting). Instead extended the existing hideTabCloseButtons toggle so it hides the close button on both flat tabs and workspace tabs. WorkspaceTabBar.tsx reads hideTabCloseButtons and gates the per-tab close button on it; Settings description updated. Shipped in 51ca77a; PR #120 closed with thanks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single setting hides close buttons on both flat tabs and workspace tabs
- [x] #2 No separate workspace-specific setting is introduced
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Folded community PR #120 into the existing 'Hide tab close buttons' setting. WorkspaceTabBar now reads hideTabCloseButtons and hides the workspace-tab ✕ alongside flat-tab close buttons; Settings description updated to mention both. PR #120 closed with thanks. Shipped in 51ca77a.
<!-- SECTION:FINAL_SUMMARY:END -->
