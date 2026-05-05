---
id: TASK-122
title: Move Known Issues to SUPPORT.md so GitHub renders it as a tab
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 11:13'
updated_date: '2026-05-05 11:14'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Known Issues currently lives as a section inside README.md. To get it as a separate tab on the repo landing page (like CONTRIBUTING.md), move it into SUPPORT.md - one of the community health files GitHub recognizes. Replace the README section with a one-liner pointing to SUPPORT.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SUPPORT.md exists at repo root and contains the Known Issues content (right-click copy after double-click in mouse-reporting TUIs + workarounds)
- [x] #2 README.md Known Issues section trimmed to a one-line pointer to SUPPORT.md
- [ ] #3 GitHub renders SUPPORT.md as a tab on the repo landing page after push
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the Known Issues content from README.md into a top-level SUPPORT.md so GitHub renders it as a tab on the repo landing page (alongside README and CONTRIBUTING). README section trimmed to a one-line pointer; SUPPORT.md also briefly directs users to the issue tracker for general help.
<!-- SECTION:FINAL_SUMMARY:END -->
