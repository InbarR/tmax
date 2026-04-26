---
id: TASK-8
title: Single-instance lock to prevent two tmax processes racing on session.json
status: To Do
assignee: []
created_date: '2026-04-26 10:26'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax has no requestSingleInstanceLock. Running 'npm start' while a packaged tmax is open results in two independent processes both reading and writing the same tmax-session.json. Both restore the same layout and spawn duplicate PTYs running the same --resume commands - two writers on one .jsonl session file. Symptom: confusing duplicate panes, inconsistent state across windows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second tmax launch is detected via app.requestSingleInstanceLock()
- [ ] #2 Second-instance event focuses the existing window instead of starting a duplicate
- [ ] #3 First instance's window is brought to foreground and unminimized if minimized
- [ ] #4 Add a config flag (default true) to disable the lock for users who explicitly want multi-instance
- [ ] #5 Test: launch tmax twice in quick succession, verify only one process exists
<!-- AC:END -->
