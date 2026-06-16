---
id: TASK-243
title: >-
  macOS: native in-app self-update via DMG swap (Squirrel.Mac can't work
  unsigned)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-16 11:06'
updated_date: '2026-06-16 13:11'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Mac user reported the in-app updater spins 'Updating...' forever and never updates. Root cause: macOS used Squirrel.Mac (autoUpdater), which requires an Apple-signed+notarized bundle; tmax is ad-hoc signed only, so it can never apply an update and the error->checkMacUpdateFallback->checkForUpdates path loops while status stays 'downloading'. Apple signing ($99/yr) is declined. Implemented a native DMG-swap updater (modeled on the update-tmax skill workaround): on macOS, download the arch-specific .dmg, and on 'Restart & Update' launch a DETACHED helper that waits for tmax to quit, mounts the DMG, atomically swaps the .app bundle (move-aside + restore-on-failure so it can never leave the app missing), clears quarantine (xattr -cr), and relaunches. Files: src/main/version-checker.ts. supportsAutoUpdate is now win32-only; macOS uses setupMacUpdater/checkMacUpdate/applyMacUpdate. REQUIRES verification on a real Mac before release (cannot be tested from Windows).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On macOS, a newer release downloads the arch-specific DMG and the status reaches 'downloaded' (no infinite 'Updating...' spinner / no Squirrel loop)
- [ ] #2 'Restart & Update' replaces /Applications/tmax.app from the DMG via a detached helper that survives the app quitting, then relaunches the new version
- [x] #3 The bundle swap never leaves tmax.app missing on any failure (move-aside + restore)
- [ ] #4 Quarantine is cleared (xattr -cr) so the updated app opens without the 'damaged' prompt
- [ ] #5 Verified end-to-end on a real Mac (Apple Silicon DMG) before shipping in a release
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Implemented in src/main/version-checker.ts: supportsAutoUpdate -> win32 only; new setupMacUpdater/checkMacUpdate (download DMG) + applyMacUpdate (detached swap script). Removed Squirrel.Mac path (update.electronjs.org + zip JSON feed) and checkMacUpdateFallback.
- Updater shell script: brick-safe atomic swap (mv old aside, mv new in, restore on failure). Verified: bash -n OK; simulated success->v2 and failure->restored-never-missing.
- Typecheck clean (no new errors).
- NOT pushed to main; on branch fix/mac-dmg-self-update. Needs real-Mac verification (AC #5) before release. Update log written to os.tmpdir()/tmax-update.log for on-device debugging.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implementation complete on branch fix/mac-dmg-self-update (commit 1e41aaa); pending real-Mac verification, not merged.

src/main/version-checker.ts: supportsAutoUpdate is now Windows-only. macOS uses a native DMG-swap updater - setupMacUpdater/checkMacUpdate download the arch .dmg and move status to "downloaded" (so the spinner resolves); applyMacUpdate writes a DETACHED helper (spawn detached + unref) that waits for tmax to quit, mounts the DMG, atomically swaps the .app bundle, clears quarantine (xattr -cr), and relaunches. Removed the broken Squirrel.Mac path.

Verified on Windows: typecheck clean; bash -n on the generated script; and a simulation proving the swap applies on success and RESTORES the old bundle on failure (never leaves tmax.app missing) - AC #3. AC #1/#2/#4 implemented but need a real Mac; AC #5 (end-to-end Mac verification) gates shipping.
<!-- SECTION:FINAL_SUMMARY:END -->
