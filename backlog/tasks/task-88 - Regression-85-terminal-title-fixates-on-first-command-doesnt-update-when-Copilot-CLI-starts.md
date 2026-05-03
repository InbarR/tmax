---
id: TASK-88
title: >-
  Regression #85: terminal title fixates on first command, doesn't update when
  Copilot CLI starts
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 14:46'
updated_date: '2026-05-03 15:06'
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
- [x] #1 Open new terminal -> cd somewhere -> run copilot CLI -> pane title updates to Copilot session topic, not 'cd <path>'
- [x] #2 Same fix applies to Claude Code: title updates when a Claude Code session is detected
- [x] #3 Explicit user rename (sessionNameOverrides) still wins over the AI-detected title
- [x] #4 Pure shell sessions (no AI) keep showing the first-command-derived title (TASK-23 behavior preserved)
- [x] #5 Bisect lands on a specific commit; PR description identifies the cause
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read TASK-23 / TASK-71 to map title-update precedence. 2. Reproduce with Playwright spec that drives a pane through cd-then-AI-link. 3. Bisect. 4. Distinguish first-command auto-title from explicit user rename via a firstCommandTitle flag. 5. Re-run spec. 6. Mark ACs and write final summary.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-88 / GH #85: pane title no longer fixates on the first shell command when an AI session attaches.

What was wrong:
TASK-23 (commit 3217ec0, shipped pre-v1.6.0) auto-renames a pane to the user's first command (e.g. 'cd C:\') and sets customTitle:true so OSC titles don't override. terminal-store.updateTerminalTitleFromSession then derived 'aiAutoTitle' as '!current.customTitle' - which evaluated to false because TASK-23 had set customTitle:true. That blocked the AI auto-title branch, leaving the pane stuck on 'cd C:\'. Worse, the pendingOverride logic captured the first-command title into sessionNameOverrides as if it were a deliberate user rename - and once TASK-71 (e4e2eb9) synced sessionNameOverrides to main for OS notifications in v1.7.0, the bad override leaked into notification bodies too, which is what made the user notice the regression now.

Bisect: the title bug itself dates back to commit 3217ec0 (TASK-23) - v1.6.1 has the same broken behaviour (verified by running the new spec against the existing out-e2e v1.6.1 package - 2 of 4 tests fail there). v1.7.0 simply made the symptom more visible via TASK-71's override-sync.

Fix (commit 0bfee53 on branch worktree-agent-abcddf53857f4f855):
- types.ts: new optional 'firstCommandTitle' flag on TerminalInstance to mark titles auto-derived from the first command (vs deliberate user renames). Both flow types still need customTitle:true to block OSC overrides; the new flag tells the AI-link path which is which.
- terminal-store.ts renameTerminal: accepts an opts.firstCommand flag, sets firstCommandTitle accordingly, and crucially does NOT propagate first-command renames into sessionNameOverrides (only deliberate renames do).
- terminal-store.ts updateTerminalTitleFromSession: distinguishes a real user rename ('hasUserRename = customTitle && !firstCommandTitle') from a first-command auto-title. Only real user renames suppress aiAutoTitle and get promoted into sessionNameOverrides. AI sessions clear firstCommandTitle on link so subsequent UI renames are treated as deliberate.
- TerminalPanel.tsx: TASK-23's first-command rename callsite now passes { firstCommand: true }.

Precedence post-fix:
1. Explicit user rename (sessionNameOverrides) - wins.
2. AI-session topic (session.summary) - wins over first-command title.
3. First-command title (TASK-23) - shell panes fallback when no AI session.
4. Generic OSC title - shell default.

Tests:
- New spec: tests/e2e/task-88-first-cmd-title-not-blocking-ai.spec.ts (4 cases): AI overrides first-cmd title; first-cmd title not promoted to overrides; explicit rename still wins; shell pane keeps first-cmd title.
- Pre-fix (out-e2e v1.6.1 package): 2 of 4 fail (regression reproduced).
- Post-fix (out-next v1.7.0+fix package): 4/4 pass.
- pr75-session-rename-title.spec.ts: 2/2 pass.
- task-71-notification-rename-override.spec.ts: 3/3 pass.
- TS error count unchanged.

Files changed (commit 0bfee53):
- src/renderer/state/types.ts
- src/renderer/state/terminal-store.ts
- src/renderer/components/TerminalPanel.tsx
- tests/e2e/task-88-first-cmd-title-not-blocking-ai.spec.ts (new)
<!-- SECTION:FINAL_SUMMARY:END -->
