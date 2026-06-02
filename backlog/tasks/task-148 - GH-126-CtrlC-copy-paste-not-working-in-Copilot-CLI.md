---
id: TASK-148
title: 'GH #126: Ctrl+C / copy-paste not working in Copilot CLI'
status: To Do
assignee: []
created_date: '2026-06-02 13:40'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reporter ofek01001: 'Ctrl C does not work / cant copy paste'. Likely two contributing causes: (1) the same status-bar focus thief as #128 - if focus is on a status-bar button, keystrokes (Ctrl+C, paste) never reach the terminal; the #128 fix should help. (2) In a mouse-tracking alt-screen TUI (Copilot CLI), the mouse is captured by the TUI so plain drag doesn't select text in xterm - the user must Shift+drag to select, then Ctrl+C. Also Ctrl+C with NO selection is SIGINT by design (Ctrl+Shift+C always copies). Needs reporter confirmation after the #128 fix + a note on Shift+drag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After the #128 focus fix, Ctrl+C/paste reach the terminal reliably
- [ ] #2 Shift+drag selection + Ctrl+C copies in a Copilot CLI pane (documented to the user)
<!-- AC:END -->
