---
id: TASK-108
title: >-
  Fix free-vite-port script: tasklist /FI mangled and no fallback when name
  lookup fails
status: Done
assignee: []
created_date: '2026-05-04 19:35'
updated_date: '2026-05-04 19:35'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
scripts/free-vite-port.js failed to kill a stale node listener on port 5995 because (a) tasklist's /FI flag was mangled when the script ran under a non-cmd shell, and (b) when tasklist returned no match the script logged 'held by unknown' and gave up. Also taskkill had the same shell-mangling issue, so even when the name was known the kill could fail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Process-name lookup falls back to PowerShell Get-Process when tasklist returns no match
- [x] #2 tasklist and taskkill use execFileSync so /F /FI cannot be translated by Git Bash/MSYS
- [x] #3 npm start no longer aborts with 'Port 5995 is already in use' when a stale node holds the port
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced execSync(tasklist /FI ...) with execFileSync to bypass shell quoting/path-translation, and added a PowerShell Get-Process fallback when tasklist returns no match. Same execFileSync treatment for taskkill so the kill itself isn't broken under Git Bash. Verified locally: stale pid 72252 (which previously logged 'held by unknown; not killing') is now correctly identified and the port freed.
<!-- SECTION:FINAL_SUMMARY:END -->
