---
id: TASK-77
title: Reduce tmax e2e suite runtime - currently several minutes per release
status: To Do
assignee: []
created_date: '2026-05-03 11:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each release runs npm run test:e2e as a gate. The suite spawns a real Electron window per spec and on the user's Windows machine takes several minutes end-to-end - long enough that it noticeably slows the release cadence. Want to reduce the runtime: parallelize specs that don't conflict on focus or window state, share a single Electron launch across compatible specs, drop redundant waits, or split the gate into a fast tier (must pass) + slow tier (nightly). Open: figure out where the time is actually spent (per-spec breakdown), then pick the highest-leverage cuts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Per-spec runtime breakdown captured so we know where the time goes
- [ ] #2 Median full-suite runtime drops materially vs current baseline (target: under 2 minutes for the must-pass tier)
- [ ] #3 Specs that exercise window focus or app-wide state still run in isolation
- [ ] #4 Release skill still uses the suite as a gate - just a faster one
<!-- AC:END -->
