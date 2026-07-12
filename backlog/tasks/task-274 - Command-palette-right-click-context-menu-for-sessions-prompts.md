---
id: TASK-274
title: 'Command palette: right-click context menu for sessions/prompts'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-12 10:53'
updated_date: '2026-07-12 10:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Added right-click context menu on session and prompt results in the command palette. Shows 'Show prompts' (opens prompts dialog for that session) and 'Show transcript' options. Uses showPromptsForSession directly instead of trying to find a live terminal pane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Right-click on session/prompt results shows context menu
- [x] #2 Show prompts opens per-session prompts dialog
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added right-click context menu on session/prompt results in command palette. 'Show prompts' uses showPromptsForSession (works without live pane). 'Show transcript' uses openTranscriptForSession. Both keep palette open so ESC returns to search. Shipped in 42f51af.
<!-- SECTION:FINAL_SUMMARY:END -->
