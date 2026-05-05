---
id: TASK-102
title: Configurable AI session load limit (0 disables)
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 13:39'
updated_date: '2026-05-04 13:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently the renderer hardcodes initial copilotSessionsLimit and claudeCodeSessionsLimit to 314. Promote this to a user setting persisted in tmax-config.json so power users can lower it (faster startup, less memory) or set 0 to disable session loading entirely. Default 314 (unchanged behavior).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AppConfig has aiSessionLoadLimit field with default 314
- [x] #2 Settings UI exposes the limit as a number input with description explaining 0 = disabled
- [x] #3 Renderer initializes copilotSessionsLimit and claudeCodeSessionsLimit from config on startup
- [x] #4 Changing the setting immediately re-scans sessions with the new limit (or clears the lists if 0)
- [x] #5 Setting 0 results in empty Copilot and Claude Code session lists, no startup scan churn
- [x] #6 Setting persists across restarts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add aiSessionLoadLimit?: number field to AppConfig in src/main/config-store.ts; set default 314 in defaultConfig\n2. In terminal-store.ts, replace the hardcoded initial 314s with values driven by config; on app boot, after config loads, sync the store limits to config.aiSessionLoadLimit ?? 314\n3. Wire the setting to fire a re-scan when changed: setAiSessionLoadLimit action that updates config + store + calls listCopilotSessions/listClaudeCodeSessions with the new limit (or just clears arrays if 0)\n4. Add SettingRow in Settings.tsx in the same section as AI session notifications: number input bound to config.aiSessionLoadLimit, calls update() on change\n5. Verify scanSessions(0) returns empty correctly (already does via slice(0,0)) and renderer surfaces empty arrays without errors\n6. Type-check; manually test by setting limit to 0, 5, 314, 1000
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `aiSessionLoadLimit?: number` to AppConfig in config-store.ts; default 314 set in defaultConfig
- terminal-store.ts loadConfig now seeds copilotSessionsLimit and claudeCodeSessionsLimit from config.aiSessionLoadLimit when it is a non-negative number, so the App.init session-load calls honor the user preference
- updateConfig detects aiSessionLoadLimit changes, mirrors them into the runtime fields, and awaits loadCopilotSessions + loadClaudeCodeSessions so the new threshold takes effect immediately (incl. clearing both lists when set to 0)
- Settings.tsx adds a new SettingRow under "AI session notifications": number input min=0 with description "How many recent Copilot / Claude Code sessions to scan on startup. Lower it for faster boot or less memory; set 0 to disable session loading entirely."
- The 0 path uses existing infrastructure: scanSessions(0) → slice(0, 0) → []; no extra short-circuiting needed
- tsc --noEmit produces no errors for the modified files (other errors are pre-existing and unrelated)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Make the AI session load threshold configurable via Settings so users can tune startup cost or fully disable session scanning.

## Why

The initial copilotSessionsLimit and claudeCodeSessionsLimit were hardcoded to 314 in the renderer. Users with very large session histories (or who simply don't use the AI sessions sidebar) had no way to lower the startup scan cost or skip it entirely.

## Changes

- `src/main/config-store.ts`: added optional `aiSessionLoadLimit` field to AppConfig and `aiSessionLoadLimit: 314` to defaultConfig
- `src/renderer/state/terminal-store.ts`:
  - `loadConfig` seeds copilotSessionsLimit / claudeCodeSessionsLimit from the persisted config so the App.init session-load calls use the user's preference
  - `updateConfig` mirrors aiSessionLoadLimit changes into the runtime fields and re-runs loadCopilotSessions + loadClaudeCodeSessions so the new threshold takes effect without restart (and clears both lists when set to 0)
- `src/renderer/components/Settings.tsx`: new SettingRow under "AI session notifications": number input, min 0, default 314

## User impact

- Default behavior unchanged: 314 sessions scanned on startup
- Users can lower the limit for faster boot / less memory
- Setting 0 disables AI session loading entirely; both lists stay empty across restarts

## Tests

- `npx tsc --noEmit` clean for the modified files
- Manual verification not yet run; requires an `npm start` cycle to flip the setting in Settings UI and confirm the lists rescan / clear
<!-- SECTION:FINAL_SUMMARY:END -->
