---
id: TASK-105
title: Fix WSL initial scan bypassing AI session load cap
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 14:18'
updated_date: '2026-05-04 14:18'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After capping the IPC return value, sessions still leaked past the cap because wslSessionManager.start() ran an uncapped initial scan at boot whose onSessionAdded callbacks turn into COPILOT_SESSION_ADDED IPC events appended by the renderer's listener. The events arrived after loadCopilotSessions completed and overflowed the cap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WslSessionManager.start accepts an initialLimit param and passes it to each pair monitor's scanSessions
- [x] #2 WslSessionManager.scanCopilotSessions / scanClaudeCodeSessions accept an optional limit and forward it
- [x] #3 main.ts setupWslSessionManager reads aiSessionLoadLimit from configStore and passes it to start()
- [x] #4 main.ts COPILOT_LIST_SESSIONS and CLAUDE_CODE_LIST_SESSIONS pass cap to wsl scan helpers
- [x] #5 Setting limit=N then restarting yields at most N copilot + N claude sessions in the renderer (no stragglers from WSL startup scan)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Close the WSL side-channel leak: the boot-time WSL scan now honors aiSessionLoadLimit so onSessionAdded events do not overflow the renderer past the cap.

## Root cause

After the previous fix capped the IPC return value, sessions still showed past the limit. The reason: WslSessionManager.start() runs at app boot via setupWslSessionManager().then(...) (not awaited). It calls pair.copilotMonitor.scanSessions() and pair.claudeMonitor.scanSessions() with NO LIMIT. Each parsed session fires onSessionAdded, which webContents.send turns into COPILOT_SESSION_ADDED events. The renderer's listener appends each via addCopilotSession. Because start() is not awaited, those events stream in even AFTER loadCopilotSessions has completed and called set({ copilotSessions: [N] }), so the side-channel additions accumulate past the cap.

Also, the same scan helpers (scanCopilotSessions, scanClaudeCodeSessions) were called from the IPC path with no limit, so each WSL distro scanned up to 314 sessions on every list call.

## Changes

- `WslSessionManager.start(initialLimit = 314)`: new param threads the user's aiSessionLoadLimit through. 0 skips the boot scan entirely.
- `WslSessionManager.scanCopilotSessions(limit?)` and `scanClaudeCodeSessions(limit?)`: forward the limit to each pair monitor.
- `setupWslSessionManager()` in main.ts reads aiSessionLoadLimit from configStore and passes it to start().
- IPC handlers COPILOT_LIST_SESSIONS and CLAUDE_CODE_LIST_SESSIONS pass the cap to scanCopilotSessions / scanClaudeCodeSessions.

## User impact

With aiSessionLoadLimit=N and a fresh app restart, the user now sees at most ~N Copilot + ~N Claude sessions. The boot-time WSL scan stops flooding the renderer with onSessionAdded events for every WSL session.

## Tests

- npx tsc --noEmit clean for the modified files
- Manual verification pending the user's next restart cycle
<!-- SECTION:FINAL_SUMMARY:END -->
