---
id: TASK-178
title: Investigate shared Playwright (Windows) CI failures across PRs
status: To Do
assignee: []
created_date: '2026-05-23 08:08'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PRs #112 and #114 both show the same Playwright (Windows) failure cluster of ~32 tests on the E2E Tests workflow, across unrelated areas: task-70 image click, task-61 paste, ai-session-sort-and-group, clawpilot-cwd-detection, rename-watcher, mouse-mode reset, and more. Same author, same time-of-week, identical failure pattern → looks like a base-branch regression or CI environment issue, not anything either PR introduced. Worth a single triage pass before it starts blocking contributors. Surfaced 2026-05-23.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Identify whether the ~32 shared failures are flake or genuine regression on main
- [ ] #2 If regression, file and fix the underlying issue
- [ ] #3 If flake / environment, document the cause and quarantine or stabilize the affected specs
- [ ] #4 Re-run #112 and #114 once base is green to confirm they merge cleanly
<!-- AC:END -->
