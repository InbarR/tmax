---
id: TASK-276
title: Confirm before closing a tab/pane session
status: Done
assignee:
  - yoziv
created_date: '2026-07-13 16:18'
updated_date: '2026-08-05 06:55'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User accidentally clicks the tab close X (or middle-clicks) when reaching for a tab to return to it, losing a live terminal/AI session. Add an opt-in confirmation dialog before closing a tab/pane, reusing the existing tmax-styled confirmDialog (AppDialog.tsx, TASK-115). Bulk closes (Close All/Others/group) get a single aggregate confirm, not one per tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new opt-in setting (default off) gates confirm-before-close; when off, closing is unchanged
- [x] #2 With the setting on, clicking the tab X or middle-clicking a tab shows a confirm dialog naming the session; Cancel keeps the session, Close removes it
- [x] #3 Bulk closes (Close All / Close Others / close group / multi-select close) show a single aggregate confirm, never one dialog per tab
- [x] #4 Setting persists across restarts and has a toggle in Settings > Tabs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add opt-in setting confirmOnCloseSession (default false) in terminal-store: state field, default value, config load, and toggleConfirmOnCloseSession action - mirroring hideTabCloseButtons.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified during Backlog audit: confirmOnCloseSession defaults off, persists through config, and is exposed under Settings > Tabs. Single-pane closes name the session; bulk and workspace closes use one aggregate confirmation. Implemented in commits cae1179 and 0b81d9c.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an opt-in confirm-before-close safeguard for terminal panes and workspaces. Individual closes identify the session, while Close All/Others/group and workspace closes show one aggregate dialog. The setting defaults off and persists from Settings > Tabs.
<!-- SECTION:FINAL_SUMMARY:END -->
