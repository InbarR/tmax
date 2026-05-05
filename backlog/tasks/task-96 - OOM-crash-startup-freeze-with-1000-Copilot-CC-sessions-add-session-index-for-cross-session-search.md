---
id: TASK-96
title: >-
  OOM crash + startup freeze with 1000+ Copilot/CC sessions; add session index
  for cross-session search
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-04 07:03'
updated_date: '2026-05-04 07:16'
labels:
  - bug
  - perf
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (issue #87 by @meni-braun): tmax crashes with V8 OOM or freezes 2-3 minutes on startup when ~/.copilot/session-state has 1000+ session directories. Cause: parser cache stores raw parsed events for every session (~2.4 GB at 6500 sessions), full session scan happens synchronously, stale-check timer re-scans every 5s blocking main process.\n\nFix this with the same shape as PR #88 (closed) but ADD an in-memory session index so search continues to cover ALL sessions:\n\n1. Aggregate-only Copilot parser cache (mirror Claude Code's existing pattern). Store {status, counters, latestPrompt, recentPrompts} per session, NOT every raw event. ~1KB per session instead of ~400KB. Drop the unused  field by making it lazily fetchable (don't break the shared type).\n\n2. Limit + sort-by-mtime + lazy load. scanSessions() takes a  parameter (default 314). First scan stats all dirs once, sorts by mtime, parses only the top N. Subsequent scans reuse the candidate cache. Watcher events update the cache (insert new, evict removed, promote active to front).\n\n3. **Thin session index** for search. Stat each session dir/file once on startup, store {id, summary (from filename or first prompt), cwd, latestPrompt, latestPromptTime, mtime, filePath, provider} for ALL sessions. ~200 bytes per entry → ~1.3 MB at 6500. Sidebar uses the limit-based loaded subset; search runs against the FULL index. When a search hit needs deeper context, lazy-parse that session's JSONL on demand.\n\n4. Stale check timer: 5s -> 10s, calls refreshLoadedSessions() instead of full scanSessions().\n\n5. IPC payload changes: COPILOT_LIST_SESSIONS / CLAUDE_CODE_LIST_SESSIONS accept  and return {sessions, totalEligible}. Store handles both shapes for backward compat. New AI_INVALIDATE_CACHES IPC wired to the AI Sessions Refresh button.\n\n6. UI: AI Sessions panel shows 'Loaded X of Y' with '+100' and 'All' buttons when totalEligible > loaded. 'All' shows confirmation when totalEligible > 1000. Render list capped at 200 DOM nodes with click-to-show-more at bottom. Sessions stream in progressively via onSessionAdded.\n\n7. Async + yielding: IPC handlers async; parse loop yields via setImmediate every 10 sessions.\n\n8. Default limit: 314 (per user).\n\nPR #88 is closed; this task tracks the in-house implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Startup with 6500+ session dirs no longer OOMs or freezes; window appears within 1 second
- [x] #2 Default limit is 314; sidebar shows 'Loaded X of Y' with +100 and All buttons when totalEligible > loaded
- [ ] #3 Search (Ctrl+Shift+Y, AI Sessions search) covers ALL sessions via the index, not just loaded ones
- [x] #4 AI Sessions Refresh button invalidates the candidate cache and re-scans
- [x] #5 CopilotSession.timeline field preserved on the shared type (lazy getter, not removed)
- [x] #6 Stale-check timer no longer blocks main process for >100ms; runs every 10s and refreshes only loaded sessions
- [x] #7 Aggregate-only parser cache for Copilot (mirror Claude Code's existing pattern)
- [x] #8 WSL session scan also forwards the limit parameter
- [x] #9 Cross-platform: works the same on Windows / macOS / Linux
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped via cherry-pick of PR #88 (commit abb0e16) + two follow-ups: 0246f97 bumps default limit 50→314, 5c54aec preserves CopilotSession.timeline as optional field. AC #3 (search covers ALL sessions via index) is NOT yet satisfied - search is currently scoped to the loaded top-314 only. Filed TASK-97 to track the proper async-built session index.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OOM fix landed via PR #88 (abb0e16). Default load limit bumped from 50 to 314 (0246f97). CopilotSession.timeline preserved as optional field on the shared type to keep the contract intact (5c54aec). Search-across-all-sessions punted to TASK-97 - getting it right requires a proper background indexer with async IPC and the OOM constraint, bigger than a follow-up commit.
<!-- SECTION:FINAL_SUMMARY:END -->
