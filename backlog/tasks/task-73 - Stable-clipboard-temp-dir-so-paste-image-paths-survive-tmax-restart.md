---
id: TASK-73
title: Stable clipboard temp dir so paste-image paths survive tmax restart
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 08:01'
updated_date: '2026-05-03 08:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each tmax process was creating a fresh tmax-clipboard-XXX dir via mkdtempSync, and window-all-closed was deleting it on shutdown. Image paths inserted into the terminal stayed visible across restarts but pointed at a now-deleted directory - clicking did nothing. Switched to a stable os.tmpdir()/tmax-clipboard dir + per-file 6h sweep on startup; window-all-closed no longer touches the dir. Concurrent instances coexist via per-file random names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clipboard image saved by run A is still openable from terminal scrollback after restarting tmax (run B)
- [x] #2 Two concurrent tmax instances do not collide writing to the shared dir
- [x] #3 sweepStaleClipboardDirs deletes individual files older than 6h, not the whole dir
- [x] #4 Legacy per-process tmax-clipboard-XXX dirs from older builds are cleaned up on first start of new build
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace mkdtempSync(...tmax-clipboard-) with stable path os.tmpdir()/tmax-clipboard.\n2. Sweep individual files older than 6h instead of nuking dir.\n3. Sweep legacy per-process dirs on first run of new build.\n4. Stop deleting dir in window-all-closed.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stable shared dir os.tmpdir()/tmax-clipboard, per-file random names + 0o600 mode for isolation. sweepStaleClipboardDirs() now deletes individual files older than 6h and also reaps legacy tmax-clipboard-XXX dirs from older builds. window-all-closed no longer touches the dir, so clipboard image paths in scrollback stay clickable across restarts.
<!-- SECTION:FINAL_SUMMARY:END -->
