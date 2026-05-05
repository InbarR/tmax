---
id: TASK-118
title: Dev mode indicator in status bar
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 07:10'
updated_date: '2026-05-05 07:11'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When running tmax via npm start (dev mode), show a small DEV pill in the status bar so it's obvious which build is running side-by-side with the packaged app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DEV pill renders in the right side of the status bar only when running from npm start (not packaged build)
- [x] #2 Pill is visually distinct (e.g. orange tint) so it's hard to miss
- [x] #3 Pill is hidden in packaged builds with no layout shift
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Expose isDev in preload via process.defaultApp
2. Add isDev export from utils/platform.ts
3. Render orange DEV pill in StatusBar before update/version chip
4. Style .status-dev-pill in global.css
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Surfaces a small orange "DEV" pill on the status bar when tmax is running via npm start, so it's obvious which build is running side-by-side with the packaged app.

Changes:
- src/preload/preload.ts: expose isDev (true when process.defaultApp is set, i.e. running via electron .)
- src/renderer/utils/platform.ts: re-export isDev for consumers
- src/renderer/components/StatusBar.tsx: render DEV pill in the right cluster, before the update/version chip
- src/renderer/styles/global.css: .status-dev-pill style (orange, bordered, small caps)

No behavior change in packaged builds (process.defaultApp is undefined there, isDev is false).
<!-- SECTION:FINAL_SUMMARY:END -->
