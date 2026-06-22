---
id: TASK-259
title: >-
  Prompt search freezes with many sessions (unbounded IPC fan-out +
  per-resolution re-sort)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-22 06:48'
updated_date: '2026-06-22 06:51'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening the global Prompt Search (PromptSearchDialog) with a large session count (~1500) freezes the app/machine. Root cause in PromptSearchDialog.tsx ~104-140: it loops over ALL sessions and fires getCopilotPrompts/getClaudeCodePrompts per session simultaneously - ~1500 concurrent IPC calls, each making the main process read+parse a session events.jsonl - flooding the main thread; AND it calls setEntries(prev.concat(...).sort(...)) on EVERY resolution, re-sorting an array that grows to thousands (~O(N^2 log N)) plus ~1500 React re-renders. Fixes: (1) concurrency-limit the per-session fetches (batches of ~8) instead of firing all at once; (2) accumulate into a ref and setEntries+sort once per batch / throttled, not per-session; (3) better: when SQLite FTS is active, query the DB for prompts instead of reading every .jsonl, and/or cap the eager load to the most recent N sessions and load more lazily.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening prompt search with 1000+ sessions does not freeze the app (stays responsive)
- [x] #2 Per-session prompt fetches are concurrency-limited, not all fired at once
- [x] #3 Entries are sorted in batches / once, not on every per-session resolution
- [ ] #4 Result list still populates correctly and stays sorted by recency
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in PromptSearchDialog.tsx: replaced the unbounded per-session fan-out + per-resolution sort with a bounded worker pool (8 concurrent fetchers pulling from a shared index) accumulating into a local array, flushed to state via a 100ms-throttled sort (plus a final flush). Caps concurrent IPC file-reads at 8 instead of ~1500 and sorts ~once per 100ms instead of per session. Typecheck clean. Pending user live-test that opening prompt search with many sessions no longer freezes (AC #1/#4).
<!-- SECTION:NOTES:END -->
