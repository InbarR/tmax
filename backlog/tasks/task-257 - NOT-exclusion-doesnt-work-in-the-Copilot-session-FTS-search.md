---
id: TASK-257
title: NOT/exclusion doesn't work in the Copilot session FTS search
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 19:10'
updated_date: '2026-06-22 06:26'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-254 added NOT to the shared and-filter, but the Copilot 'Search all sessions' box (CopilotPanel) is backed by SQLite FTS5 (copilot-session-db.ts searchSessions), a separate path. Standalone exclusion like 'NOT scheduled' fails: FTS5 has no 'match all except X' (MATCH needs a positive term), so the code strips the leading NOT (line ~172) and searches FOR 'scheduled' - showing exactly what the user wanted excluded. Mixed queries ('step NOT scheduled') should work via FTS5 binary 'A NOT B'. Fix: for queries whose only effect is exclusion (leading/standalone NOT, no positive FTS term), bypass FTS and filter the loaded session list client-side with the NOT-aware shared and-filter. Tradeoff/caveat: client-side exclusion only sees session titles/summaries (+cwd), not full turn content, and only the currently-loaded set - document this in the search help text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 'NOT scheduled' in the session search hides sessions whose title/summary contains 'scheduled' and shows the rest
- [ ] #2 Mixed 'term NOT other' still works (via FTS binary NOT)
- [ ] #3 Existing positive/AND/OR FTS queries are unchanged
- [x] #4 Search help text notes exclusion is title/summary-scoped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in CopilotPanel.tsx: handleSearch sends '' to the FTS search when the query is exclusion-only (all tokens negate), resetting the list; the `filtered` memo then drops sessions whose summary+cwd match the excluded terms via the NOT-aware matchesAllTokens. Mixed queries still go to FTS (binary NOT). Help text/placeholder now advertise NOT and note the NOT-only title scope. Typecheck clean; exclusion logic covered by TASK-254 and-filter unit tests. Pending live verification of the repro (NOT scheduled).
<!-- SECTION:NOTES:END -->
