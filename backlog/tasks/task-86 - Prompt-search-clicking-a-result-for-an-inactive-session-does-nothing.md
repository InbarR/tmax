---
id: TASK-86
title: 'Prompt search: clicking a result for an inactive session does nothing'
status: To Do
assignee: []
created_date: '2026-05-03 14:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user searches via Ctrl+Shift+Y and clicks a result whose session has no open pane in this window, jumpTo() in PromptSearchDialog.tsx falls back to showSessionSummary(entry.sessionId) - which sets sessionSummaryRequest in the store. SessionSummary.tsx:145 then renders null because its session lookup ('claudeCodeSessions.find(...) || copilotSessions.find(...) || null') returns null. Net effect: click closes the search dialog and nothing else happens. Two reasons the lookup can fail: (a) the session has been removed/expired from the in-memory list since the search results were built; (b) cross-window panes - search results include sessions known to other tmax windows whose summaries this window never received. Fix: SessionSummary should either hydrate from the search-result entry passed in, OR fetch the session data on-demand when the lookup misses. Cleanest: pass the full SearchEntry through to showSessionSummary so it has fallback display data even if the live session disappeared.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clicking a search result for a session not open in this window opens the SessionSummary popover with title / folder / prompt history visible
- [ ] #2 Works for sessions whose pane lives in another tmax window
- [ ] #3 Works for sessions that have been removed from the live in-memory list since the search opened
- [ ] #4 When the live session IS available, popover behavior is unchanged (existing path)
- [ ] #5 ESC closes the popover the same way it does today
<!-- AC:END -->
