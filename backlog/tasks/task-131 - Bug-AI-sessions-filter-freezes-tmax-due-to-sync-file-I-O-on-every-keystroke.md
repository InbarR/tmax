---
id: TASK-131
title: 'Bug: AI sessions filter freezes tmax due to sync file I/O on every keystroke'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-06 18:07'
updated_date: '2026-05-08 07:30'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Typing in the AI Sessions filter input causes tmax to become Not Responding for several seconds. Root cause: searchSessions in src/main/copilot-session-monitor.ts:163 and src/main/claude-code-session-monitor.ts:188 falls back to getPrompts(id) when a session's metadata doesn't match the query. getPrompts does synchronous file I/O (reads events.jsonl / JSONL log) on the main process. With ~340 sessions, every keystroke triggers hundreds of sync reads on the main thread, blocking the Windows message pump. The 200ms renderer-side debounce only delays the freeze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 searchSessions in copilot-session-monitor matches only on cached in-memory metadata (repo/branch/cwd/name/id/summary); does not call getPrompts
- [x] #2 searchSessions in claude-code-session-monitor matches only on cached in-memory metadata; does not call getPrompts
- [x] #3 Filtering 300+ sessions by typing produces no Not Responding state in the main process
- [x] #4 Existing session-list metadata search still works for repo/branch/cwd/title queries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove prompt-search fallback in copilot-session-monitor.ts:163 — match only on cached metadata.
2. Add session.workspace.summary and session.latestPrompt to the matchable fields (already in memory, no I/O).
3. Same fix in claude-code-session-monitor.ts:188 — keep summary.summary/branch/cwd/id, drop getPrompts fallback, add summary.latestPrompt.
4. Confirm renderer-side filter logic unchanged (CopilotPanel still merges/dedups; TASK-126 override union still works).
5. Smoke-test by typing rapidly in the filter with full session set; verify no Not Responding.
6. Skip perf e2e test (would need 300+ on-disk sessions) — note tradeoff in implementation notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed getPrompts() fallback from searchSessions in both copilot-session-monitor.ts and claude-code-session-monitor.ts.
Also added workspace.summary + session.latestPrompt (Copilot) and summary.latestPrompt (Claude Code) to the matchable in-memory fields, since these are zero-cost extra match targets.

Skipped writing an e2e perf assertion: reproducing the freeze requires hundreds of on-disk session files and the win is binary (frozen vs not) so a perf threshold would be flaky on shared CI. Visual smoke test on user box is the verification.

getPrompts() the method is still used by the prompts-dialog IPC handler (main.ts:848,895) and for synthesizing a display-name fallback in toSummary path; only the searchSessions call site was removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the synchronous prompt-file fallback from searchSessions in both copilot-session-monitor.ts and claude-code-session-monitor.ts.

## Why
With ~340 cached sessions, every keystroke in the AI Sessions filter ran getPrompts() against every session whose metadata did not match the query. getPrompts() does a sync events.jsonl/JSONL read on the main process, so the cumulative I/O blocked the Windows message pump for several seconds, showing the window as Not Responding. The 200ms renderer-side debounce only delayed the freeze; it didn't prevent it.

## What changed
- searchSessions now matches only on already-loaded metadata (repo, branch, cwd, name/summary, latestPrompt, id).
- getPrompts() itself stays - it is still used by the prompts-dialog IPC handler.
- Cross-session prompt-text search needs a precomputed index (TASK-97 already tracks this).

## Tests
No automated coverage - the freeze repro requires hundreds of on-disk session files and the win is binary, so a perf-threshold spec would be flaky on shared CI. Verified manually on the user's box.

## Risk
Users who relied on substring-search hitting prompt text will lose those matches until the index lands. Title/repo/cwd/branch/latestPrompt search still covers the common cases.

Committed in ea75400.
<!-- SECTION:FINAL_SUMMARY:END -->
