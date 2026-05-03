---
id: TASK-71
title: Sync user-renamed pane title overrides to main for notification body
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-03 07:40'
updated_date: '2026-05-03 07:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the AI session notification body uses session.summary (firstPrompt fallback to cwdFolder) as the line-1 identifier. The renderer applies a user-set name override on top of that via sessionNameOverrides[id], so a renamed pane like 'tmax paste' shows correctly in the tab/pane title but NOT in OS notifications - main process can't see renderer-only state. Sync the override map from renderer to main via IPC so notifications show the same display name the user sees in the pane title. Easiest path: a new IPC channel SESSION_NAME_OVERRIDES_SYNC fired from terminal-store.setSessionNameOverride; main caches the map and notifyCopilotSession looks up overrides[session.id] before falling back to summary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Renaming a pane via the UI updates the OS notification body for that session's next toast
- [ ] #2 Notification line 1 prefers user override > session.summary (skipping slug) > cwdFolder > id slice
- [ ] #3 No regression for un-renamed sessions - they continue to use session.summary
- [ ] #4 Override map persists across tmax restart (already saved to tmax-session.json - main can read on startup)
<!-- AC:END -->
