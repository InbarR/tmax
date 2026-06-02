---
id: TASK-143
title: 'Clean scrollbar model: show scrollbar only when there''s real scrollback'
status: To Do
assignee: []
created_date: '2026-06-01 07:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The terminal currently forces the xterm scrollbar always-visible (global.css overflow-y: scroll !important), so live full-screen TUIs (Copilot CLI, Claude Code, vim) - which have no xterm scrollback (baseY === 0) and draw their own screen - show an empty, undraggable gutter that looks broken and invites a drag that does nothing. This drove repeated 'scrollbar doesn't work' reports and a failed attempt (reverted TASK-184) to fake scrollback into it. Simpler honest model: the scrollbar represents xterm scrollback only. Show it (with a draggable thumb) when the pane has scrollback (baseY > 0); hide it for live TUIs, which scroll via wheel forwarding + their own UI. Must NOT manipulate xterm's viewport scrollHeight/scrollTop (the corruption cause). Keep TASK-180 drag-to-scroll for scrollback panes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panes with xterm scrollback (shells, resumed sessions, command output) show a draggable scrollbar; drag scrolls the buffer (TASK-180 preserved)
- [ ] #2 Live full-screen TUI panes (mouse-tracking + baseY === 0) show no empty/undraggable scrollbar gutter
- [ ] #3 Wheel scrolling is unchanged in both cases; no xterm viewport DOM/scrollHeight manipulation
- [ ] #4 e2e: scrollback pane has a working scrollbar; alt-screen pane has none; rendering is not corrupted
<!-- AC:END -->
