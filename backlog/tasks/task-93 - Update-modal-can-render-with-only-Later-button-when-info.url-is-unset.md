---
id: TASK-93
title: Update modal can render with only 'Later' button when info.url is unset
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 15:42'
updated_date: '2026-05-03 15:42'
labels:
  - bug
  - ux
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reported (screenshot via internal channels) that the Update Available modal sometimes shows only the X close button + Later button - no Download or Restart & Update primary action. Cause: StatusBar.tsx update-modal-actions renders Restart only on status==='downloaded', Download only when info.url is truthy. There exists a state where status is something else and info.url is undefined - the user is left with no way to act on the update without manually navigating to GitHub. Fix: always render a Download primary button; default its URL to https://github.com/InbarR/tmax/releases/latest when info.url isn't set, so the user can always reach the release page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update Available modal always renders a primary action button (Download or Restart & Update)
- [x] #2 Download button always opens a working URL - prefers info.url when set, falls back to /releases/latest
- [x] #3 Existing 'downloaded' state still shows Restart & Update
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Always render Download button when status isn't 'downloaded'. URL falls back to https://github.com/InbarR/tmax/releases/latest if info.url is unset, so the modal is never a dead end. 'downloaded' state still shows Restart & Update unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
