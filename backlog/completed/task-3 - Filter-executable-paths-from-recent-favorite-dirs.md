---
id: TASK-3
title: Filter executable paths from recent/favorite dirs
status: Done
assignee: []
created_date: '2026-02-18 21:19'
updated_date: '2026-02-18 21:20'
labels:
  - bug
  - dirs
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Executable paths like cmd.exe, pwsh.exe were being added to the recent directories list. Only actual folder paths should appear in recents and favorites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 addRecentDir rejects paths ending with file extensions
- [x] #2 Saved sessions filter out exe paths on load
- [x] #3 Terminal title changes only update cwd for paths without file extensions
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three-layer fix:
1. addRecentDir gate: rejects paths matching \.(exe|cmd|bat|...) regex
2. loadDirs: filters saved sessions on load to clean up old exe entries
3. TerminalPanel onTitleChange: changed from exe-blocklist to extension-allowlist — only paths without any file extension update cwd

Files changed:
- src/renderer/state/terminal-store.ts — addRecentDir guard + loadDirs filter
- src/renderer/components/TerminalPanel.tsx — hasFileExtension check replaces looksLikeExe
<!-- SECTION:FINAL_SUMMARY:END -->
