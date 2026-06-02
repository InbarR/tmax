---
id: TASK-147
title: 'GH #128: text cursor invisible in Copilot CLI (status-bar focus thief)'
status: Done
assignee: []
created_date: '2026-06-02 13:40'
updated_date: '2026-06-02 13:40'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reporter mvar-ms (v1.9.3, Win32): the text cursor disappears in Copilot CLI panes inside tmax (fine in a regular terminal). The attached diag log names the focus thief via the TASK-165 instrumentation: focus-refocus-check shows thief BUTTON .status-help-btn and .status-mode-btn/.status-overflow-btn - status-bar buttons take focus on click, pulling it off the terminal, so xterm renders the cursor hollow/invisible. FIX SHIPPED: delegated preventDefault on mousedown over the status bar (StatusBar.tsx) so buttons act via onClick without grabbing focus. Verify with the reporter on the next build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking status-bar buttons no longer moves focus off the terminal
- [x] #2 Cursor stays solid/visible in Copilot CLI panes after using the status bar
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Status-bar buttons were focus thieves (named by the #128 diag log via TASK-165 instrumentation: status-help-btn, status-mode-btn/status-overflow-btn). They took focus on click, pulling it off the terminal so xterm rendered the cursor hollow. Fixed with a delegated preventDefault on mousedown over the status bar (StatusBar.tsx) - buttons act via onClick without grabbing focus. Likely also helps GH #126 (lost keystrokes). Shipped to main.
<!-- SECTION:FINAL_SUMMARY:END -->
