---
id: TASK-280
title: 'Optimize startup performance: defer AI session loading'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-08-08 16:03'
updated_date: '2026-08-08 16:03'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moved AI session loading (314 sessions) to after restoreSession() and moved createWindow() earlier in main process startup. User confirmed 'launched much faster'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI sessions load after terminal restore
- [x] #2 createWindow called before monitors/watchers/keybindings
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deferred copilot/claude-code session loading to after restoreSession() in App.tsx init(). Moved createWindow() earlier in main.ts (before monitors, watchers, keybindings). Two commits pushed and verified.
<!-- SECTION:FINAL_SUMMARY:END -->
