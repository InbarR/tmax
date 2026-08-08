---
id: TASK-282
title: 'Prompt search UX: highlight, context menu, match indicators, limit increase'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-08-08 16:04'
updated_date: '2026-08-08 16:04'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Multiple UX improvements to PromptSearchDialog: click-to-select, right-click context menu, matched-in-prompt badge, snippet context for deep matches, increased prompt limit from 10 to 500.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single-click highlights, double-click opens
- [x] #2 Right-click context menu with Open and Show prompts
- [x] #3 matched in prompt badge when match is in truncated text
- [x] #4 Prompt limit increased from 10 to 500
- [x] #5 Duplicate React key warning fixed
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
onMouseDown with preventDefault + clickLockedRef keeps selection stable. Context menu passes correct entry via ctxMenu state. promptSnippet() shows context around deep matches. Badge shows when match only in body. IPC limit raised to 500, MAX_CACHED_PROMPTS to 500. Fixed duplicate keys by appending index.
<!-- SECTION:FINAL_SUMMARY:END -->
