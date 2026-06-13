---
id: TASK-155
title: Fix npm install / npx tmax-terminal on all platforms
status: Done
assignee: []
created_date: '2026-06-11 13:51'
updated_date: '2026-06-11 13:51'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by Leonid (Power BI mobile). npm install -g tmax-terminal / npx tmax-terminal 404'd on every platform: install.js requested asset names the release never published (Windows expected -<version>.zip vs actual -portable.zip; macOS/Linux had no zip at all, only dmg/deb/rpm). Also on macOS cli.js spawned the inner Mach-O binary directly, which often left no visible window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 install.js downloads the correct per-platform asset (no 404)
- [x] #2 build.yml publishes a portable zip for Windows, macOS, and Linux
- [x] #3 macOS launches via open -a so the window appears
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 1.10.1. install.js downloads tmax-<platform>-<arch>-portable.zip (ditto-extracts the macOS .app); build.yml emits macOS + Linux portable zips alongside Windows; cli.js launches the macOS .app via 'open -a'. Verified npm install -g tmax-terminal works end-to-end on Windows.
<!-- SECTION:FINAL_SUMMARY:END -->
