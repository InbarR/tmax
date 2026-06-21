---
id: TASK-248
title: 'Review/merge PR #136 - Move to workspace submenu adjacency fix'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-20 16:00'
updated_date: '2026-06-20 16:18'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External contributor PR (Abhinav Sharma). The 'Move to workspace' submenu rendered detached/far-left when the overflow menu is right-aligned, because it positioned via a guessed 240px width. Fix right-anchors the flipped submenu so it hugs the trigger row. Cherry-picked the code-only commit onto main locally as 4d6d29f (dropped the branch's divergent download-history.json stats-snapshot commits). Cosmetic, low-risk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Code fix cherry-picked to main without the branch's download-history.json cruft
- [x] #2 User confirms the submenu hugs the menu on right-edge panes (live test)
- [x] #3 Change pushed to origin/main (or PR merged on GitHub)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped. User confirmed the submenu hugs the menu on right-edge panes; PR #136 squash-merged to origin/main (56a7216), author Abhinav Sharma credited. Cosmetic right-anchor fix for the Move to workspace submenu. (Local main also carries an earlier cherry-pick 4d6d29f of the same patch - redundant with the origin merge, reconcile on next push.)
<!-- SECTION:FINAL_SUMMARY:END -->
