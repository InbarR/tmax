---
id: TASK-149
title: 'GH #127: cannot scroll up the conversation in Copilot CLI'
status: To Do
assignee: []
created_date: '2026-06-02 13:40'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reporter ofek01001: 'cant scroll up a conversation'. In a live alt-screen TUI (mouseTracking on, baseY===0), tmax forwards the wheel to the CLI as a mouse-button report and relies on the CLI's own pager to scroll (TerminalPanel wheel handler ~line 1558). Claude Code honors these; Copilot CLI may not scroll its conversation on wheel reports - so there is no tmax scrollback to fall back on (alt-screen apps own their screen). This is the capability the reverted TASK-184 tried to add and that TASK-142 should re-implement safely (overlay scrollbar that sends wheel reports, without touching xterm's viewport). Needs a decision: pursue TASK-142, or document the limitation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Wheel scrolls the Copilot CLI conversation, OR the limitation is clearly documented
- [ ] #2 Any fix does not manipulate xterm's viewport (avoids the v1.9.2 corruption)
<!-- AC:END -->
