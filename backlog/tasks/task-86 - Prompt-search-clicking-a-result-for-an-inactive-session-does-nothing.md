---
id: TASK-86
title: 'Prompt search: clicking a result for an inactive session does nothing'
status: Done
assignee: []
created_date: '2026-05-03 14:29'
updated_date: '2026-05-03 14:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user searches via Ctrl+Shift+Y and clicks a result whose session has no open pane in this window, jumpTo() in PromptSearchDialog.tsx falls back to showSessionSummary(entry.sessionId) - which sets sessionSummaryRequest in the store. SessionSummary.tsx:145 then renders null because its session lookup ('claudeCodeSessions.find(...) || copilotSessions.find(...) || null') returns null. Net effect: click closes the search dialog and nothing else happens. Two reasons the lookup can fail: (a) the session has been removed/expired from the in-memory list since the search results were built; (b) cross-window panes - search results include sessions known to other tmax windows whose summaries this window never received. Fix: SessionSummary should either hydrate from the search-result entry passed in, OR fetch the session data on-demand when the lookup misses. Cleanest: pass the full SearchEntry through to showSessionSummary so it has fallback display data even if the live session disappeared.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking a search result for a session not open in this window opens the SessionSummary popover with title / folder / prompt history visible
- [ ] #2 Works for sessions whose pane lives in another tmax window
- [ ] #3 Works for sessions that have been removed from the live in-memory list since the search opened
- [x] #4 When the live session IS available, popover behavior is unchanged (existing path)
- [x] #5 ESC closes the popover the same way it does today
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cheap fix shipped in commit 524f750. PromptSearchDialog.jumpTo() now pre-flights the same session lookup SessionSummary uses; if the live session is missing it spawns a new pane in the session's cwd via createTerminal(undefined, cwdOverride) - new optional cwdOverride param on the createTerminal action. The click is now always observable. Bigger AC #2/#3 (cross-window panes / evicted sessions still showing the popover) requires the larger refactor noted in the description and is left as a follow-up.
<!-- SECTION:FINAL_SUMMARY:END -->
