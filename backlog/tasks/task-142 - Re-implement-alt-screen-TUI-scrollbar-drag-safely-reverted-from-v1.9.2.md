---
id: TASK-142
title: Re-implement alt-screen TUI scrollbar drag safely (reverted from v1.9.2)
status: To Do
assignee: []
created_date: '2026-06-01 07:18'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1.9.2 shipped a change (TASK-184) that injected a tall spacer into xterm's .xterm-viewport and manipulated scrollTop to give alt-screen TUIs (Copilot CLI, Claude Code) a draggable scrollbar, plus an onBinary->PTY forwarder. In practice it broke the core AI-CLI experience: scrambled/interleaved text rendering, mouse-tracking report bytes leaking into the input as literal characters, mouse text-selection broken (recovered only via Reset Mouse Mode), stuck input, and a permanently-stuck jump-to-bottom button (spacer inflated scrollHeight so the 'scrolled away' check never cleared). Reverted on main in 70c3536 to restore known-good v1.9.1 terminal behavior; shipping as v1.9.3. Any future attempt to add scrollbar drag / wheel forwarding for alt-screen TUIs must not manipulate xterm's own viewport scrollHeight/scrollTop, must not leave mouse tracking in a stuck state, and must ship with e2e coverage for rendering integrity + selection + jump-to-bottom in a mouse-tracking pane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Alt-screen TUI wheel/scroll improvements (if reattempted) do not corrupt xterm rendering
- [ ] #2 Mouse text-selection and mouse-report delivery remain correct in mouse-tracking panes (no bytes leaking to input)
- [ ] #3 Jump-to-bottom button works in panes with the feature active
- [ ] #4 e2e coverage proves rendering integrity + selection + jump-to-bottom before merge
<!-- AC:END -->
