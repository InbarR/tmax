---
id: TASK-145
title: 'Settings toggle: restore previous session on launch'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-02 10:18'
updated_date: '2026-06-02 11:12'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users want a way to NOT reopen the previous session on startup. Today only a dev escape hatch exists (--no-restore / TMAX_NO_RESTORE=1) which also disables SAVING, so it's unsuitable for normal use. Add a user-facing Settings toggle 'Restore previous session on launch' (default ON). When OFF, tmax opens fresh on launch but still SAVES session state (so re-enabling restores the last session). Should not affect the existing dev flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings has a 'Restore previous session on launch' toggle, default ON, persisted to config
- [x] #2 When OFF, a fresh launch opens a clean window (no prior tabs/panes restored)
- [x] #3 When OFF, session state is still saved on exit (toggling back ON restores the last session)
- [x] #4 The existing --no-restore / TMAX_NO_RESTORE dev flag behavior is unchanged
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Settings > Terminal > Startup > 'Restore previous session on launch' (default on). restoreSession() short-circuits when restoreSessionOnLaunch === false, opening a fresh window; session saving is unaffected so re-enabling restores the most recent session. Dev --no-restore flag unchanged. Files: types.ts (config field), terminal-store.ts (gate), Settings.tsx (toggle).
<!-- SECTION:FINAL_SUMMARY:END -->
