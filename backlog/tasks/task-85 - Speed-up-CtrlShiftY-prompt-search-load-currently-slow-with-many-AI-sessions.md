---
id: TASK-85
title: >-
  Speed up Ctrl+Shift+Y prompt search load - currently slow with many AI
  sessions
status: To Do
assignee: []
created_date: '2026-05-03 14:28'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening the prompt search dialog (Ctrl+Shift+Y) shows 'Loading prompts...' for a noticeable time before any results appear. Cause: PromptSearchDialog fires one IPC per session (getCopilotPrompts / getClaudeCodePrompts), each of which reads the session's JSONL file from disk and extracts up to 20 prompts. With dozens of sessions across both providers, that's many round-trips, all of which must complete before Promise.all resolves and the user sees ANY result. Easy wins: (1) bulk IPC that returns prompts for all sessions in one round-trip; (2) progressive render - set entries incrementally as each session's prompts resolve so the list populates instead of staying empty until the last one finishes; (3) cache parsed prompts in main keyed on file mtime so reopening is instant when nothing changed; (4) drop the per-session prompt cap from 20 to 5 since the search rarely needs deep history. Best combination: (3) + (2). Implementation: PromptSearchDialog.tsx fetch loop around line 109; main IPC handlers around src/main/main.ts:786 and 821; underlying parsers extractCopilotPrompts / extractClaudeCodePrompts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening Ctrl+Shift+Y dialog shows the first results within ~200ms even with 50+ sessions
- [ ] #2 Subsequent opens (no session changes) are near-instant via in-main cache
- [ ] #3 Results stream in progressively - user can start typing/searching before all sessions have loaded
- [ ] #4 Cache invalidates when a session JSONL file's mtime changes
- [ ] #5 No regression to existing search relevance / sort order
<!-- AC:END -->
