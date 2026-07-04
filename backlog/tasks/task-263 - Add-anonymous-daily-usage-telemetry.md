---
id: TASK-263
title: Add anonymous daily usage telemetry
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-01 12:48'
updated_date: '2026-07-04 15:35'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a lightweight anonymous daily usage telemetry system in the Electron main process and a matching GitHub Actions workflow that records daily usage pings without affecting app startup or functionality.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App launch schedules at most one anonymous usage ping per local day and skips silently when telemetry is disabled or no GitHub token is available
- [x] #2 The usage ping posts a repository_dispatch event to InbarR/tmax with anonymous machine ID, app version, platform, and date using only built-in Node/Electron APIs
- [x] #3 A GitHub Actions workflow appends incoming usage ping payloads to telemetry/pings.jsonl and pushes them safely under concurrency control
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect main-process config and startup flow for the cleanest telemetry hook and config flag storage.
2. Implement src/main/telemetry.ts using built-in crypto/fs/https and gh token discovery with silent failure handling.
3. Wire the delayed sendUsagePing call into app.whenReady(), add the GitHub Actions workflow plus telemetry data file, then run targeted tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Switched from GitHub repository_dispatch to Azure App Insights (tmax-telemetry resource in eastus, Visual Studio Enterprise subscription). No token needed from users anymore. Same anonymous daily ping logic preserved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added lightweight anonymous daily usage telemetry for tmax.

Changes:
- Added src/main/telemetry.ts to compute a stable anonymous machine ID, gate on telemetry.enabled, cache one ping per local day, discover a GitHub token via gh/GITHUB_TOKEN, and silently post usage-ping repository_dispatch events.
- Scheduled the ping from src/main/main.ts 5 seconds after startup so telemetry never blocks window creation.
- Added .github/workflows/usage-ping.yml to serialize incoming dispatches into telemetry/pings.jsonl and commit them back to the repo.
- Added unit coverage for the telemetry module's hashing, send, and skip paths.

Validation:
- npx vitest run tests/unit/main/telemetry.test.ts
- npx tsc --noEmit --skipLibCheck --moduleResolution bundler --module ESNext --target ES2022 src/main/telemetry.ts
<!-- SECTION:FINAL_SUMMARY:END -->
