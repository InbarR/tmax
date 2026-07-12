---
id: TASK-269
title: 'Revert copy-on-select PR #141'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-11 15:27'
updated_date: '2026-07-11 15:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #141 (copy-on-select by yoziv) was squash-merged then reverted because the default-ON behavior surprised Windows/Mac users who don't expect selection to copy. Commented on PR inviting re-submit with default OFF. Reverted in ec67b5c.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Copy-on-select reverted from main
- [x] #2 PR #141 closed with feedback comment
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Squash-merged then reverted PR #141 (copy-on-select). Left comment on PR explaining reasoning and inviting re-submit with default OFF. Revert: ec67b5c.
<!-- SECTION:FINAL_SUMMARY:END -->
