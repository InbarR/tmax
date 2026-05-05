---
id: TASK-119
title: 'Fresh-launch flag: skip session restore + save'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 07:15'
updated_date: '2026-05-05 07:16'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When running a second tmax for live testing (via tmax.bat / npm start), it currently restores the same panes as the running instance and overwrites the saved state on exit, causing pty conflicts. Add a way to launch fresh: skip session restore AND skip session save, so the test instance never touches the real saved state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Setting TMAX_NO_RESTORE=1 or passing --no-restore at launch causes SESSION_LOAD to return null and SESSION_SAVE to no-op for the lifetime of that process
- [x] #2 Default tmax.bat in C:\utils sets the flag so dev launches always start fresh
- [x] #3 Packaged builds and a normal npm start without the flag continue to restore and save as before
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/main/main.ts, derive NO_RESTORE = TMAX_NO_RESTORE=1 || argv has --no-restore
2. Gate IPC.SESSION_LOAD to return null when NO_RESTORE
3. Gate IPC.SESSION_SAVE to no-op when NO_RESTORE (otherwise the test instance clobbers the running instance's saved state on exit)
4. Gate seedSessionNameOverridesFromDisk so the test instance also doesn't inherit notification override state
5. Update C:\utils	max.bat to set TMAX_NO_RESTORE=1 before npm start
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a fresh-launch escape hatch for running a second tmax (typically via npm start) alongside the packaged one without pty conflicts or saved-state stomping.

Changes:
- src/main/main.ts: NO_RESTORE constant from TMAX_NO_RESTORE env var or --no-restore argv. Gates SESSION_LOAD (returns null), SESSION_SAVE (no-op), and seedSessionNameOverridesFromDisk (skip).
- C:\utils	max.bat: sets TMAX_NO_RESTORE=1 before npm start so the dev launcher always starts fresh.

Why SESSION_SAVE no-op matters: without it, the test instance would overwrite the real saved state on exit with whatever (possibly empty) layout it had, losing the running instance's panes after both close.

No behavior change for packaged builds or a plain npm start without the env var/flag.
<!-- SECTION:FINAL_SUMMARY:END -->
