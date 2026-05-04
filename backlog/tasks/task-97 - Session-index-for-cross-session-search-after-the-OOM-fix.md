---
id: TASK-97
title: Session index for cross-session search after the OOM fix
status: To Do
assignee: []
created_date: '2026-05-04 07:15'
labels:
  - perf
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #88 (merged as abb0e16) fixed the OOM crash by limiting parsed sessions to top 314 by mtime. Search currently only covers the loaded set - users with thousands of sessions can no longer search across all of them without manually clicking +N / All. The right fix is a thin async-built session index (one entry per session: id, cwd, repository, branch, summary, latestPrompt, latestPromptTime, mtime - ~200 bytes each, ~1.3 MB at 6500 sessions). After the initial scan loads the top N, kick off a background indexer that yields via setImmediate every batch and populates the index for non-loaded sessions. searchSessions queries the full index; for matches that aren't currently loaded, return a synthetic CopilotSessionSummary built from the index entry so the UI can show them without lazy-parsing the full session. Lazy-parse the full session only if the user actually opens it. This restores complete search coverage without re-introducing the OOM.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Background indexer runs after initial scan; yields every 20 sessions via setImmediate so main process stays responsive
- [ ] #2 Index entry is small enough that 6500 sessions fits in under 2 MB total
- [ ] #3 searchSessions returns hits from across ALL sessions (loaded OR indexed), not just the loaded subset
- [ ] #4 Index updates in lockstep with the candidate cache when watcher events fire
- [ ] #5 Lazy load full session only on user open, never during search
<!-- AC:END -->
