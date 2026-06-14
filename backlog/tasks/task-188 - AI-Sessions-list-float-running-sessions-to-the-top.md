---
id: TASK-188
title: 'AI Sessions list: float running sessions to the top'
status: Done
assignee: []
created_date: '2026-06-14 07:59'
updated_date: '2026-06-14 07:59'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the AI Sessions panel, sessions that are actively running (status != idle) should appear at the top of the list (and their repo groups float up when grouped), so active work is always visible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running (non-idle) sessions sort above idle ones within the list and groups
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an active-status tier (isActiveStatus = status != 'idle') to sortSessions and to the group ordering in CopilotPanel, just under the pinned tier, so running sessions and their groups float to the top in every sort mode.
<!-- SECTION:FINAL_SUMMARY:END -->
