---
id: TASK-272
title: 'Prompt search freeze fix: worker thread + remove live SQLite search'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-12 10:52'
updated_date: '2026-07-12 10:52'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PromptSearchDialog was freezing the app on open because better-sqlite3 runs synchronously on Electron's main thread. Large LIKE queries on the turns table blocked the UI for seconds. Fixed by moving SQLite queries to a Worker thread and removing live search-as-you-type entirely in favor of client-side filtering of preloaded results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SQLite prompt queries run in a Worker thread, never blocking main
- [x] #2 Live search-as-you-type removed; dialog loads 300 recent prompts and filters client-side
- [x] #3 Worker has 10s timeout with kill+respawn on stuck queries
- [x] #4 IPC handlers have try/catch to handle worker failures gracefully
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved searchPrompts and getRecentPrompts to a Worker thread via inline eval'd script (no separate file needed). Worker resolves better-sqlite3 via absolute path from main process. 10s timeout kills stuck workers. Removed live SQLite search-as-you-type from PromptSearchDialog; now loads 300 recent prompts on open and filters client-side only. Zero freeze risk. Shipped in f6e123c, fb4487e.
<!-- SECTION:FINAL_SUMMARY:END -->
