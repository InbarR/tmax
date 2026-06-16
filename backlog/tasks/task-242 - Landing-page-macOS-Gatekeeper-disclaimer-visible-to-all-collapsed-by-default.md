---
id: TASK-242
title: 'Landing page: macOS Gatekeeper disclaimer visible to all, collapsed by default'
status: Done
assignee: []
created_date: '2026-06-15 11:26'
updated_date: '2026-06-15 11:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to the download-section work. The macOS 'tmax is damaged / Move to Trash' note was previously shown only when macOS was the detected platform. Requirement: show it even on Windows/Linux (visitors often grab the Mac build to pass along). Always-showing the full warning + screenshot looked alarming, so it was reworked into a collapsed <details> disclosure: a calm one-line summary by default, auto-expanded only when macOS is the detected/selected platform. Shipped in docs/index.html (commits 400b2aa, dd39c6b) and live on the Pages site.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 macOS bypass note is reachable regardless of detected platform (shown whenever a Mac build exists)
- [x] #2 Collapsed by default on non-macOS so it is not alarming; expandable on click
- [x] #3 Auto-expanded when macOS is the detected or selected platform
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 400b2aa + dd39c6b (main). Mac note is now a collapsed <details> shown whenever the release has a Mac build; auto-expands on macOS detect/select. Verified live on inbarr.github.io/tmax.
<!-- SECTION:FINAL_SUMMARY:END -->
