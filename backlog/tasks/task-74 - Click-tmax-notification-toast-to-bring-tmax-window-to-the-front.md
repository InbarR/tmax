---
id: TASK-74
title: Click tmax notification toast to bring tmax window to the front
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 08:02'
updated_date: '2026-05-03 08:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Notifications fired by tmax (via Electron Notification) had no click handler - clicking did nothing. Wired notifyCopilotSession to invoke a click handler set by main.ts that does the same restore/show/focus dance as the global show-window hotkey.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking a tmax 'Claude Code: Session Ready' or 'Copilot: Waiting for Input' toast brings the tmax window to the front
- [x] #2 Works when tmax is minimized, hidden, or just unfocused
- [x] #3 Cross-platform: handler attaches on Windows (toast click), macOS (banner click), Linux (notification click)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add setNotificationClickHandler in copilot-notification.ts.\n2. Wire notification.on('click', ...) when handler is set.\n3. From main.ts after createWindow(), register handler that does restore/show/focus on mainWindow.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
copilot-notification.ts gained setNotificationClickHandler() + an onClick branch that fires when a handler is set. main.ts wires the handler to restore-if-minimized, show-if-hidden, and focus the main window. Same logic the existing show-window hotkey uses.
<!-- SECTION:FINAL_SUMMARY:END -->
