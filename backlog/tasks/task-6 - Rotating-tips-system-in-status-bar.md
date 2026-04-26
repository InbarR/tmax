---
id: TASK-6
title: Rotating tips system in status bar
status: To Do
assignee: []
created_date: '2026-04-26 10:25'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the static 'Ctrl+U: clear input' hint with a Claude-Code-style rotating tips system. The current hint shows during waitingForUser/idle which is most of the time the user is at a prompt - effectively always visible, ignored. Cycle through 15-20 tips covering Ctrl+U, F5 to continue, Ctrl+Shift+K prompts dialog, Ctrl+wheel zoom, broadcast mode, the new pane ⋯ menu, click-to-jump on the banner, etc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TIPS array with at least 15 entries covering key shortcuts and features
- [ ] #2 Some tips are AI-session-specific and only show when an AI session is focused
- [ ] #3 Tips rotate every 30 seconds
- [ ] #4 Eligible tips reset when focused pane changes (AI vs non-AI)
- [ ] #5 Always rendered in the status bar center, replacing the static Ctrl+U hint
- [ ] #6 Tip styling matches the existing status-dim aesthetic
<!-- AC:END -->
