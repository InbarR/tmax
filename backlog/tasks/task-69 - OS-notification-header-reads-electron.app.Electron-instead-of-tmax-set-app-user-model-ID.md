---
id: TASK-69
title: >-
  OS notification header reads 'electron.app.Electron' instead of 'tmax' (set
  app user model ID)
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-03 07:23'
updated_date: '2026-05-03 11:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-64 landed, native tmax notifications fire correctly when a Claude Code session finishes a turn. Cosmetic issue: the Windows toast header reads 'electron.app.Electron' instead of 'tmax'. Cause: Electron defaults to its own appUserModelID (the Windows-specific identifier used in the start-menu, taskbar, and toast notifications) when the app does not set one explicitly. Fix is a one-liner in main.ts: call app.setAppUserModelId() with a stable id like 'com.github.inbarr.tmax' inside the app.ready handler (or earlier where appropriate). On macOS this call is a no-op so it is safe cross-platform. The id should match what the Squirrel.Windows installer uses if any (check forge.config.ts) so taskbar / start-menu shortcuts also pick it up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Windows toast header for tmax-native OS notifications reads 'tmax' (or whatever name we choose) instead of 'electron.app.Electron'
- [x] #2 app.setAppUserModelId is called once at startup with a stable id
- [x] #3 No regression in macOS/Linux notifications
- [x] #4 If the Squirrel installer uses a specific id, the chosen id matches
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added app.setAppUserModelId('com.squirrel.tmax.tmax') in main.ts inside app.whenReady, gated to process.platform === 'win32' (no-op on macOS/Linux). The id matches Squirrel's default shortcut AUMID convention 'com.squirrel.<AppName>.<ExeName>', so installed and dev runs share an identity. AC #1 still pending the user's manual restart-and-verify.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in commit b8f85e7. main.ts calls app.setAppUserModelId('com.squirrel.tmax.tmax') inside app.whenReady. Matches the Squirrel installer convention so dev runs and installed runs share identity. No-op on macOS/Linux. User confirmed CC toast header now reads 'tmax'.
<!-- SECTION:FINAL_SUMMARY:END -->
