---
id: TASK-27
title: Stabilize full-suite e2e harness (cross-test PTY/Electron leaks)
status: Done
assignee: []
created_date: '2026-04-26 16:14'
updated_date: '2026-05-01 15:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Individual specs pass deterministically in isolation, but ~2 of them flake when running the full 50+ spec suite. The shuffling pattern (different tests fail on different runs - broadcast, float-buffer-preserved, detached-double-paste rotate) is the signature of leaked PTY processes or Electron windows accumulating in the harness. Investigate launchTmax close() to ensure all child processes / windows are reaped before the next spec, and consider either resetting between tests or per-spec process isolation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Full e2e suite is green on first run on the user's machine
- [ ] #2 No PTY processes leak between specs (verified via task-manager / ps)
- [ ] #3 broadcast / float-buffer-preserved / detached-double-paste pass in full-suite runs
<!-- AC:END -->
