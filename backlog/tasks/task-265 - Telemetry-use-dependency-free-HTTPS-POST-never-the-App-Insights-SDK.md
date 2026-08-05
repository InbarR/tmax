---
id: TASK-265
title: 'Telemetry: use dependency-free HTTPS POST, never the App Insights SDK'
status: Done
assignee: []
created_date: '2026-07-04 16:02'
updated_date: '2026-08-05 06:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The applicationinsights SDK v3.x (OpenTelemetry-based) must NOT be used in tmax. In a packaged Electron app it auto-starts collectors and forks helper processes off the app binary (tmax.exe via ELECTRON_RUN_AS_NODE), which snowballed into a runaway spawn loop that pegged CPU and consumed ~10GB+ RAM (reported as 'tmax keeps opening again and again with more instances'). Fixed by replacing the SDK call in src/main/telemetry.ts with a plain node:https POST to the App Insights ingestion REST endpoint (/v2/track), sending the same anonymous once-per-day usage-ping envelope. Removed the applicationinsights dependency from package.json and package-lock. Unit tests in tests/unit/main/telemetry.test.ts updated to mock node:https and assert the POST envelope. Guardrail for the future: do not reintroduce the applicationinsights or any OTel SDK in the Electron main process for a simple ping; a raw HTTPS POST cannot spawn processes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 applicationinsights removed from deps;telemetry.ts uses node:https POST only;daily-ping dedup preserved;telemetry unit tests pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the App Insights SDK with a dependency-free node:https telemetry POST, preserving anonymous daily deduplication and removing the process-spawning dependency. Telemetry unit coverage passes.
<!-- SECTION:FINAL_SUMMARY:END -->
