---
id: TASK-44
title: Vite renderer port configurable via TMAX_VITE_PORT env var
status: Done
assignee: []
created_date: '2026-04-30 10:09'
updated_date: '2026-04-30 10:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
vite.renderer.config.ts pinned the dev server to 5995 with strictPort:true, blocking parallel npm start (e.g. running tmax from main alongside a feature worktree). Now reads TMAX_VITE_PORT with 5995 fallback so the secondary instance can use 'TMAX_VITE_PORT=5996 npm start'. electron-forge's vite plugin auto-injects MAIN_WINDOW_VITE_DEV_SERVER_URL from the bound port, so the main process picks up the new port automatically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default behavior unchanged when env var is unset (still 5995)
- [x] #2 Setting TMAX_VITE_PORT to a different value lets a second tmax run in parallel
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
vite.renderer.config.ts now reads TMAX_VITE_PORT with 5995 fallback. Default unchanged; second instance runs with TMAX_VITE_PORT=5996 npm start. electron-forge's vite plugin injects MAIN_WINDOW_VITE_DEV_SERVER_URL from the actual bound port, so no main-process changes needed.
<!-- SECTION:FINAL_SUMMARY:END -->
