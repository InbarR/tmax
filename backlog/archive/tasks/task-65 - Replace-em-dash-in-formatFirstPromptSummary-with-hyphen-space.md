---
id: TASK-65
title: Replace em dash in formatFirstPromptSummary with hyphen-space
status: To Do
assignee: []
created_date: '2026-05-02 19:50'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spotted by the TASK-59 agent during their work but deliberately not changed since out of scope: src/main/claude-code-events-parser.ts:30 in formatFirstPromptSummary uses an em dash in the format string '/${name} — ${rest}'. Per saved user preference (memory: feedback_no_em_dashes), em dashes should be replaced with ' - ' (space-hyphen-space) in user-facing strings. This format string ends up in the Claude Code session summary and surfaces in the AI Sessions sidebar / pane titles, so it IS user-facing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/main/claude-code-events-parser.ts:30 uses ' - ' instead of ' — '
- [ ] #2 Search the rest of the file (and git grep for similar patterns in src/main/) for any other em dashes in user-facing strings, replace them too
<!-- AC:END -->
