---
id: TASK-166
title: Wheel scroll not working in a pane after detach + reattach
status: To Do
assignee: []
created_date: '2026-06-13 13:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (2026-06-13): after detaching a copilot pane and reattaching it, wheel scroll no longer works in that pane. Same family as the TASK-164 selection bug: the reattached pane is on the ALTERNATE screen buffer with mouse tracking on (verified for selection via diag), so the wheel is forwarded to the app / does not scroll. The custom wheel handler (TerminalPanel attachCustomWheelEventHandler) forwards to the app when mouseTrackingMode!='none' && baseY===0; on the alt buffer with no scrollback the wheel goes to copilot which may not scroll. Likely needs AI-pane-aware handling or a mouse/alt-screen state resync on reattach. Reproduce by instrumenting the wheel path with diag logs like TASK-164.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After detach+reattach of a copilot/claude pane, wheel scroll works in that pane
- [ ] #2 Reproduced and covered by a test
<!-- AC:END -->
