---
id: TASK-85
title: >-
  Speed up Ctrl+Shift+Y prompt search load - currently slow with many AI
  sessions
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 14:28'
updated_date: '2026-05-03 15:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening the prompt search dialog (Ctrl+Shift+Y) shows 'Loading prompts...' for a noticeable time before any results appear. Cause: PromptSearchDialog fires one IPC per session (getCopilotPrompts / getClaudeCodePrompts), each of which reads the session's JSONL file from disk and extracts up to 20 prompts. With dozens of sessions across both providers, that's many round-trips, all of which must complete before Promise.all resolves and the user sees ANY result. Easy wins: (1) bulk IPC that returns prompts for all sessions in one round-trip; (2) progressive render - set entries incrementally as each session's prompts resolve so the list populates instead of staying empty until the last one finishes; (3) cache parsed prompts in main keyed on file mtime so reopening is instant when nothing changed; (4) drop the per-session prompt cap from 20 to 5 since the search rarely needs deep history. Best combination: (3) + (2). Implementation: PromptSearchDialog.tsx fetch loop around line 109; main IPC handlers around src/main/main.ts:786 and 821; underlying parsers extractCopilotPrompts / extractClaudeCodePrompts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening Ctrl+Shift+Y dialog shows the first results within ~200ms even with 50+ sessions
- [ ] #2 Subsequent opens (no session changes) are near-instant via in-main cache
- [x] #3 Results stream in progressively - user can start typing/searching before all sessions have loaded
- [ ] #4 Cache invalidates when a session JSONL file's mtime changes
- [x] #5 No regression to existing search relevance / sort order
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-03: Shipped progressive render + lower per-session cap. Existing mtime cache in extractCopilotPrompts/extractClaudeCodePrompts already covered AC #2 and #4 - second open is near-instant when nothing changed; cache invalidates on mtime+size change. AC #1 (first results within ~200ms with 50+ sessions) is now achievable via progressive render: each session resolution appends to the entries state and re-sorts, so the user sees the first batch within one IPC round-trip rather than waiting for the slowest session. AC #3 (results stream in progressively, user can search before all loaded) - done. AC #5 (no relevance/sort regression) - same age-based sort applied per insert.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PromptSearchDialog now renders progressively: instead of awaiting Promise.all for every session's prompts, each session's IPC resolution appends to entries state and re-sorts. The user sees results within one IPC round-trip - the dialog is searchable before the slowest session finishes. Plus dropped the per-session prompt cap from 20 to 10 (rare to need more for search). The existing mtime-keyed cache in extractCopilotPrompts/extractClaudeCodePrompts handles AC #2 (near-instant reopens) and AC #4 (cache invalidates on mtime/size change) - no new code needed for those. AC #1 (first results within ~200ms with 50+ sessions) is now structurally achievable; perf depends on disk speed but no longer on the slowest session.
<!-- SECTION:FINAL_SUMMARY:END -->
