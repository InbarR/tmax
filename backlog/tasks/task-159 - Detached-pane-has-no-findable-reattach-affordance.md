---
id: TASK-159
title: Detached pane has no findable reattach affordance
status: Done
assignee: []
created_date: '2026-06-11 13:51'
updated_date: '2026-06-13 13:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Maintainer hit this: after detaching a pane there was no obvious way to reattach. The detached tab is only a dimmed tab (gone entirely when the tab bar is hidden), and the detached window has no Reattach control. Could not reproduce the 'tab missing even with tab bar visible' case in Playwright - need exact repro steps. Add a Reattach button in the detached window + a StatusBar detached indicator (like the dormant popover).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A detached pane can be reattached without relying on the tab bar being visible
- [ ] #2 The detached window exposes a Reattach control
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Detached window renders its own title bar + Reattach control (theme-matched chrome). e2e task-159-detached-titlebar passes. Follow-up TASK-165: show the real pane title+color instead of a generic label.
<!-- SECTION:FINAL_SUMMARY:END -->
