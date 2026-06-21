---
id: TASK-251
title: Investigate 36 stable Playwright failures on Windows CI
status: To Do
assignee: []
created_date: '2026-06-20 16:18'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surfaced while reviewing PR #134: the Playwright (Windows) job fails 36 tests / 222 passed CONSISTENTLY across re-runs, independent of the PR under test (none of the 36 are transcript tests). The failures cluster in clipboard/native-integration specs: task-61-rich-text-paste, task-70-image-path-click (openPath), task-123-ado-clipboard-html, task-120-tui-drag-copy, clawpilot-cwd-detection, issue-2-rename-watcher, ai-session-sort-and-group, task-106/107 url/md-path click, task-100/169 mouse-mode, workspaces-multi-select. Likely a CI-environment issue (clipboard access / openPath wiring / headless native viewer) or stale baseline. This red check is currently masking real signal on every PR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause of the 36 failures identified (env vs real regression)
- [ ] #2 CI either green or the genuinely-broken subset is isolated and tracked
<!-- AC:END -->
