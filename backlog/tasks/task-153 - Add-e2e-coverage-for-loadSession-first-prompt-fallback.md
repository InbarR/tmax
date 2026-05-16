---
id: TASK-153
title: Add e2e coverage for loadSession first-prompt fallback
status: To Do
assignee: []
created_date: '2026-05-16 16:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-151 fixed the loadSession first-prompt fallback (drops the `workspace.name === id` guard) but only added e2e coverage for the ClawPilot cwd fingerprint. The loadSession code path needs its own test: workspace.yaml without a `summary:` field + events.jsonl with at least one user.message → summary should be the first prompt.

This is heavier than the existing notification-only specs because it needs to drive the real CopilotSessionMonitor against a fixture sessions directory. Suggestion: factor a helper that writes a temp session directory and points a monitor instance at it, asserts toSummary().summary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Test fixture writes workspace.yaml (no summary) + events.jsonl (1 user.message)
- [ ] #2 Test instantiates CopilotSessionMonitor on the fixture, calls scanSessions(), asserts session.summary === the first prompt
- [ ] #3 Test also covers the case where workspace.yaml has both a repository and no summary - summary still wins via the fallback
<!-- AC:END -->
