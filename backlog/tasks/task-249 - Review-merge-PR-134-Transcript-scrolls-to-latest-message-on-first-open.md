---
id: TASK-249
title: 'Review/merge PR #134 - Transcript scrolls to latest message on first open'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-20 16:01'
updated_date: '2026-06-20 16:18'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External contributor PR (mpmisha). Opening Transcript on a long conversation dumped you at the first message instead of newest. Fix moves the initial scroll into a post-commit useLayoutEffect (single-rAF could fire before layout, scrollHeight~0, landing at top). Diff reviewed: correct and strictly safer than current single-rAF. Original CI showed 36 failures but NONE are transcript tests - they are unrelated clipboard/native-integration specs (flake/stale-base). Re-ran the Playwright Windows job to confirm; awaiting result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Failing Playwright run is confirmed flake/stale-base (not caused by this PR)
- [ ] #2 Fix verified to land on the newest message for long transcripts
- [x] #3 PR merged to main
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Re-ran Playwright (Windows): identical 36 failed / 222 passed, ZERO transcript specs among failures - confirms the failures are a stable pre-existing CI-baseline problem, not caused by this PR. Squash-merged to origin/main (ea68034), author mpmisha. AC #2 left unchecked: the original land-at-top bug was not reproducible locally (a 1000-prompt transcript already landed at bottom), so the fix is verified sound by code review (post-commit useLayoutEffect, strictly safer than single-rAF) but not by observing a fixed repro.
<!-- SECTION:NOTES:END -->
