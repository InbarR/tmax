---
id: TASK-154
title: >-
  Bug: cwd auto-link poaches old active session when fresh Copilot pane launches
  in same cwd
status: In Progress
assignee:
  - '@claude'
created_date: '2026-05-16 16:56'
updated_date: '2026-05-16 16:56'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User opened a new terminal, typed `copilot`. Copilot CLI launched and showed welcome tips. But tmax attached the pane to an unrelated older session ("I am doing a session tomorrow about ClawPilot...") that was still 'Thinking' because some other process (backgrounded ClawPilot meeting helper) was driving it in the same cwd.

Root cause: updateTerminalTitleFromSession's cwd-based auto-link (terminal-store.ts:3918-3960) gates on `sessionActive` and focused-pane heuristics but doesn't disambiguate between an old session that's incidentally active and a new session that the pane just spawned.

Fix direction (chosen by user): use per-session creation time. Plumb workspace.yaml's `created_at` through CopilotSessionSummary as `createdAt`, then skip cwd auto-link when pane.aiProcessDetectedAt is set and session.createdAt is more than ~30s before it (definitely-older session).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CopilotSessionSummary exposes `createdAt?: number` (ms-since-epoch)
- [ ] #2 parseWorkspace reads `created_at:` from workspace.yaml and converts to ms
- [ ] #3 sessionRowToSummary populates createdAt from the SQLite created_at column
- [ ] #4 cwd auto-link in terminal-store.ts skips a session when pane.aiProcessDetectedAt - session.createdAt exceeds a 30s threshold
- [ ] #5 Manual scenario from screenshots no longer poaches: fresh `copilot` pane in cwd C with an active older session in same cwd C stays unlinked until its own session is registered
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `createdAt?: number` to CopilotSessionSummary (shared/copilot-types.ts) and CopilotWorkspaceMetadata\n2. Parse `created_at:` in parseWorkspace; convert ISO timestamp to ms-since-epoch; populate workspace.createdAt\n3. Surface createdAt through toSummary and the SQLite path (sessionRowToSummary)\n4. In terminal-store.ts cwd auto-link loop, add: if `t.aiProcessDetectedAt && session.createdAt && t.aiProcessDetectedAt - session.createdAt > 30_000` -> skip\n5. Add a diag-log line when this guard fires so we can debug from logs\n6. e2e or manual repro: pane with stale aiProcessDetectedAt + active old session in same cwd should not auto-link
<!-- SECTION:PLAN:END -->
