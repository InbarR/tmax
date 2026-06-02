---
id: TASK-144
title: Fix blank chart when Week + New per interval combined on stats page
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-06-02 06:23'
updated_date: '2026-06-02 06:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When stacking is by release and the timeline is grouped by week with delta mode, releases whose data lives in a single weekly bucket end up with empty point arrays after delta conversion. The top-5 sort comparator then dereferences points[points.length-1].count on an empty array, throwing a TypeError that aborts renderTimeline before it can draw bars or update the footer note. Fix: drop empty series after delta conversion (and/or guard the sort comparator).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting Week + New per interval renders bars instead of a blank canvas
- [ ] #2 Footer note updates to reflect the active mode and interval
- [ ] #3 Other mode/interval combinations still render as before
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in PR https://github.com/InbarR/tmax/pull/125. Two changes in docs/stats-5d5f6800d035.html: (1) drop empty series after cumulative->delta conversion and guard the top-N sort comparator with optional chaining — prevents TypeError that was blanking Week + New per interval, (2) rank top-5 by activity in the visible window (sum of deltas / last-first) instead of all-time cumulative, so newer releases like v1.9.x can actually appear.
<!-- SECTION:NOTES:END -->
