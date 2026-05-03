---
id: TASK-94
title: Release skill missing Squirrel auto-update artifacts (RELEASES + nupkg)
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 16:07'
updated_date: '2026-05-03 16:07'
labels:
  - bug
  - release-process
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1.7.0 was cut without uploading the RELEASES manifest and .nupkg to the GitHub release - only Setup.exe and the zip were attached. Result: Windows Squirrel users on v1.6.1 cannot auto-update; checkWindowsUpdate falls through to checkGitHub which only sets status='available' with a URL to the release page, and the user has to manually download and run Setup.exe. Fix: update the /release skill instructions to include all four Windows artifacts (Setup.exe, RELEASES, *.nupkg, zip). Once 1.7.1 is cut with the full set, Squirrel on existing v1.7.0 installs will auto-update going forward; v1.6.1 users still need a manual install for the one-time hop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 .claude/commands/release.md lists RELEASES and the .nupkg as required release artifacts
- [ ] #2 Next patch release (1.7.1) attaches all four Windows artifacts to the GitHub release
- [x] #3 Documented: existing v1.6.1 users still need a manual one-time install to reach v1.7.1; v1.7.0+ users will auto-update from there
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #2 will be satisfied when 1.7.1 ships - the skill update is in place so the next release will pick up the missing artifacts automatically.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Release skill now lists RELEASES + .nupkg as required Windows artifacts. Next release picks them up automatically; v1.7.0 → v1.7.1 will be auto-updateable for users already on 1.7.0. v1.6.1 holdouts need a one-time manual install.
<!-- SECTION:FINAL_SUMMARY:END -->
