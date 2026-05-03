---
id: TASK-88
title: >-
  Regression #85: terminal title fixates on first command, doesn't update when
  Copilot CLI starts
status: To Do
assignee: []
created_date: '2026-05-03 14:46'
labels:
  - regression
  - bug
  - workspaces
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User-reported issue (https://github.com/InbarR/tmax/issues/85, reporter @ronny8360988) on tmax v1.7.0: when a new terminal is opened, the pane title is set from the first command the user runs (e.g. 'cd <path>'). Then if the user starts a Copilot CLI session in that pane, the title is supposed to update to reflect the Copilot session's topic - but it stays stuck on 'cd <path>'. Used to work in earlier versions (regression). Likely culprit areas: (1) the pane-name-from-first-command path that landed for non-AI panes (TASK-23 pane-title-from-first-command); (2) the AI-session linking path that should retitle the pane once a Copilot or Claude Code session is detected as belonging to it; (3) something in TASK-71 (sessionNameOverrides sync) interfering with the live update. Bisect tmax commits between last-known-working version (likely 1.6.x) and 1.7.0 to find the offender. Fix should make the AI-session-detected title TAKE PRECEDENCE over the first-command-derived title, while still letting the user's explicit rename override either.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open new terminal -> cd somewhere -> run copilot CLI -> pane title updates to Copilot session topic, not 'cd <path>'
- [ ] #2 Same fix applies to Claude Code: title updates when a Claude Code session is detected
- [ ] #3 Explicit user rename (sessionNameOverrides) still wins over the AI-detected title
- [ ] #4 Pure shell sessions (no AI) keep showing the first-command-derived title (TASK-23 behavior preserved)
- [ ] #5 Bisect lands on a specific commit; PR description identifies the cause
<!-- AC:END -->
