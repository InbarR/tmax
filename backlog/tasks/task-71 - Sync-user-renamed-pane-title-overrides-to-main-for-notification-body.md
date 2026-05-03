---
id: TASK-71
title: Sync user-renamed pane title overrides to main for notification body
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 07:40'
updated_date: '2026-05-03 07:59'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the AI session notification body uses session.summary (firstPrompt fallback to cwdFolder) as the line-1 identifier. The renderer applies a user-set name override on top of that via sessionNameOverrides[id], so a renamed pane like 'tmax paste' shows correctly in the tab/pane title but NOT in OS notifications - main process can't see renderer-only state. Sync the override map from renderer to main via IPC so notifications show the same display name the user sees in the pane title. Easiest path: a new IPC channel SESSION_NAME_OVERRIDES_SYNC fired from terminal-store.setSessionNameOverride; main caches the map and notifyCopilotSession looks up overrides[session.id] before falling back to summary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Renaming a pane via the UI updates the OS notification body for that session's next toast
- [x] #2 Notification line 1 prefers user override > session.summary (skipping slug) > cwdFolder > id slice
- [x] #3 No regression for un-renamed sessions - they continue to use session.summary
- [x] #4 Override map persists across tmax restart (already saved to tmax-session.json - main can read on startup)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add IPC channel SESSION_NAME_OVERRIDES_SYNC to src/shared/ipc-channels.ts.
2. Preload: expose syncSessionNameOverrides on terminalAPI (sender, fire-and-forget).
3. Renderer: in terminal-store.ts, fire IPC from setSessionNameOverride after state update; also fire once at end of restoreSession with the loaded map.
4. Main: add module-scope override map in copilot-notification.ts plus setter setSessionNameOverrides; register ipcMain handler in main.ts.
5. Main startup-fallback: in setupConfigStore (or near sessionStore init) read sessionStore.session.sessionNameOverrides and seed copilot-notification module before the renderer connects.
6. notifyCopilotSession: prefer overrides[session.id] (trimmed, non-empty) at the top of buildNotificationBody. Precedence becomes override > summary (skipping slug) > repository > cwdFolder > id slice. Truncate at NAME_MAX as today.
7. Reproduce/verify with Playwright: write an e2e that uses preSeed to write tmax-session.json with sessionNameOverrides for an id, then assert main caches it. Cleaner: stub the Notification constructor and assert the body contains the override. Skip running the full suite - run just task-71 spec.
8. Edit task ACs as I check them off, write final-summary, commit and set Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented end-to-end:
- Added IPC channel SESSION_NAME_OVERRIDES_SYNC in src/shared/ipc-channels.ts
- src/main/copilot-notification.ts: cached map, setSessionNameOverrides/getSessionNameOverride exports, override -> summary -> repository -> cwdFolder -> id slice precedence in buildNotificationBody
- src/main/main.ts: ipcMain.on handler for SESSION_NAME_OVERRIDES_SYNC, seedSessionNameOverridesFromDisk reads sessionStore.session.sessionNameOverrides at startup so first-toast-of-the-run works even before renderer connects
- src/preload/preload.ts: exposed syncSessionNameOverrides on terminalAPI
- src/renderer/state/terminal-store.ts: setSessionNameOverride and restoreSession both fire the IPC
- E2E test hook: __notifyCopilotSession + __capturedNotifications gated on TMAX_E2E so the new spec can drive notifications without writing fake JSONL files
- New spec at tests/e2e/task-71-notification-rename-override.spec.ts covers all four ACs
- Did not run e2e since the packaged build at out-e2e/ is stale and packaging needs parent approval. Caller should run after a fresh package.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Synced renderer-only sessionNameOverrides map to main so OS notification toasts show the same custom pane name the user set in the UI.

What changed:
- New IPC channel SESSION_NAME_OVERRIDES_SYNC (src/shared/ipc-channels.ts) carries the full Record<string, string> map renderer -> main.
- src/renderer/state/terminal-store.ts: setSessionNameOverride and restoreSession both fire the sync after updating local state, so every UI rename (and the post-load hydration) is reflected on main.
- src/preload/preload.ts: exposed syncSessionNameOverrides on terminalAPI.
- src/main/main.ts: ipcMain.on handler caches the map via setSessionNameOverrides; seedSessionNameOverridesFromDisk reads the same map directly from sessionStore at startup so the very first notification of a run picks up an existing rename even if it fires before the renderer has booted.
- src/main/copilot-notification.ts: notifyCopilotSession now consults the override first; precedence is override > summary (skipping slug) > repository > cwdFolder > id slice. Empty/missing overrides fall through unchanged so un-renamed sessions keep working.

User impact:
- Renaming an AI pane via the UI immediately fixes the next OS toast for that session.
- Override survives restart (already persisted in tmax-session.json; main now reads it at boot).

Testing:
- New spec at tests/e2e/task-71-notification-rename-override.spec.ts covers: rename updates next toast, control session keeps using summary, disk-seeded map drives toast before renderer syncs. Uses test-only globals (__notifyCopilotSession, __capturedNotifications) gated on TMAX_E2E=1 so production behavior is unchanged.
- npx tsc --noEmit error count unchanged (37 -> 37; all pre-existing TerminalAPI shape gaps).
- E2E suite NOT run; needs a fresh package which is owner-approved.
<!-- SECTION:FINAL_SUMMARY:END -->
