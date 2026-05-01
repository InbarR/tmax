---
id: TASK-23
title: Pane title from first command for non-AI panes
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generic 'cmd.exe' title replaced with whatever the user typed before first Enter (e.g. 'npx vibe-kanban'). Watches term.onData, sanitizes the buffer, renames once with custom=true so OSC titles don't override.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 First user command becomes the pane title
- [x] #2 AI panes / panes with custom titles are unaffected
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in bee1fec
<!-- SECTION:FINAL_SUMMARY:END -->
