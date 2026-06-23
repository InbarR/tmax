---
id: TASK-260
title: >-
  Fix: packaged app hangs on 'Restoring session...' due to fsevents-less
  chokidar fd exhaustion
status: Done
assignee: []
created_date: '2026-06-23 11:35'
updated_date: '2026-06-23 11:35'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packaged (dist) builds hung forever on the SessionLoading screen while 'npm start' worked. Root cause: chokidar's macOS FSEvents backend needs the native 'fsevents' optionalDependency, which was present in dev node_modules but never bundled into the packaged app by the forge postPackage hook. Without it, chokidar (with usePolling:false) falls back to one fs.watch fd per directory; on accounts with thousands of ~/.copilot session dirs (this user: 4,972) that exhausts the file-descriptor limit (EMFILE: too many open files, watch), saturating the main event loop so renderer startup IPC stalls and isRestoring never clears. Finder/Dock launches inherit a 256 fd soft limit, compounding it. Fix: bundle fsevents in forge.config.ts postPackage (like node-pty/better-sqlite3); externalize fsevents in vite.main.config.ts; add utils/fsevents.ts canUseNativeRecursiveWatch() and use it in copilot- and claude-code-session-watcher to fall back to bounded stat-polling when fsevents is unavailable (defense-in-depth so a missing native module degrades instead of hanging).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Packaged macOS app bundles fsevents and copilot-watcher logs usePolling=false with zero EMFILE
- [x] #2 When fsevents is absent, watchers degrade to usePolling=true (bounded polling) without an EMFILE flood or hang
- [x] #3 Packaged app loads past 'Restoring session...' and restores the saved multi-pane session
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped. Bundled fsevents into the packaged app (forge.config.ts postPackage), externalized it (vite.main.config.ts), and added utils/fsevents.ts canUseNativeRecursiveWatch() used by both session watchers to fall back to bounded polling when fsevents can't load. Verified on a real package: usePolling=false + 0 EMFILE with fsevents, graceful usePolling=true fallback without it; both watchers reach 'ready' and the app restores its 4-pane session past the loading screen. 115 unit tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
