---
id: TASK-264
title: Prompt minimap scrollbar - visual indicator of prompt positions
status: To Do
assignee: []
created_date: '2026-07-01 12:54'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a minimap-style scrollbar (like ChatGPT) on the right edge of terminal panes that shows where each prompt is located in the scrollback. Each prompt appears as a small horizontal tick mark. The current viewport position is highlighted (bright/white tick). This gives users a quick visual sense of how far through a session they are and where prompts are distributed. Should integrate with the existing prompt detection system.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vertical minimap bar on the right edge of terminal panes showing prompt positions as tick marks
- [ ] #2 Current viewport position highlighted distinctly (white/bright vs dim for others)
- [ ] #3 Clicking a tick scrolls to that prompt
- [ ] #4 Works in both normal shell and TUI/AI panes
- [ ] #5 Doesn't interfere with existing scrollbar or terminal interaction
<!-- AC:END -->
