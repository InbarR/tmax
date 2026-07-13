---
id: TASK-276
title: Confirm before closing a tab/pane session
status: In Progress
assignee:
  - yoziv
created_date: '2026-07-13 16:18'
updated_date: '2026-07-13 16:20'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User accidentally clicks the tab close X (or middle-clicks) when reaching for a tab to return to it, losing a live terminal/AI session. Add an opt-in confirmation dialog before closing a tab/pane, reusing the existing tmax-styled confirmDialog (AppDialog.tsx, TASK-115). Bulk closes (Close All/Others/group) get a single aggregate confirm, not one per tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new opt-in setting (default off) gates confirm-before-close; when off, closing is unchanged
- [ ] #2 With the setting on, clicking the tab X or middle-clicking a tab shows a confirm dialog naming the session; Cancel keeps the session, Close removes it
- [ ] #3 Bulk closes (Close All / Close Others / close group / multi-select close) show a single aggregate confirm, never one dialog per tab
- [ ] #4 Setting persists across restarts and has a toggle in Settings > Tabs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add opt-in setting confirmOnCloseSession (default false) in terminal-store: state field, default value, config load, and toggleConfirmOnCloseSession action - mirroring hideTabCloseButtons.
<!-- SECTION:PLAN:END -->
