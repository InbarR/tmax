---
id: TASK-88
title: >-
  Regression: pane title fixates on first command instead of updating to AI
  session topic (GH #85)
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 14:47'
updated_date: '2026-05-03 15:04'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1.7.0 regression. When user opens a new terminal, runs cd somewhere, then starts a Copilot CLI session, the pane title remains 'cd <path>' (TASK-23 first-command title) instead of updating to the AI session topic. Earlier versions retitled the pane to the AI session topic when an AI session was detected. Expected precedence: user explicit rename (sessionNameOverrides) > AI-detected session title > first-command title (TASK-23 fallback for shell panes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pane title updates to AI session topic when a Copilot/Claude session is detected after a first-command title was set
- [x] #2 User explicit rename (sessionNameOverrides) still wins over both AI session title and first-command title
- [x] #3 Pure shell panes (no AI session detected) keep showing first-command title (no TASK-23 regression)
- [x] #4 Playwright e2e spec reproduces the bug pre-fix and passes post-fix
- [x] #5 TS error count unchanged (still 37)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read TASK-23 and TASK-71 to understand the title precedence today.\n2. Find renameTerminal/customTitle code paths in terminal-store.ts.\n3. Find aiSessionId linking + session-detected rename code in CopilotPanel.tsx and claude-code-session-monitor.ts.\n4. Identify why first-command title now blocks AI session retitle (likely customTitle:true sticking permanently).\n5. Reproduce with Playwright (use existing harness). Spec: open new terminal, type 'cd C:\', wait for title to be 'cd C:\', then drive aiSessionId link via __terminalStore (or simulate session detection), assert title flips to topic. Should FAIL on main.\n6. Bisect commits between v1.6.1 and v1.7.0 if needed. Suspect TASK-71 commit e4e2eb9 (stale session name on relink fix), TASK-23 3217ec0 (pre v1.6.1 already), or a4e2eb9 (TASK-71).\n7. Fix: when AI session is detected, allow it to override a first-command-derived title. The fix: distinguish first-command title from explicit user rename (sessionNameOverrides).\n8. Re-run spec, verify pass.\n9. Check ACs, write final-summary, set Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: TASK-23 (commit 3217ec0, shipped pre-v1.6.0) sets customTitle:true when auto-renaming the pane to the user's first command. In updateTerminalTitleFromSession (terminal-store.ts ~line 2937), when an AI session matches a candidate terminal, the code uses 'aiAutoTitle: !current.customTitle' which evaluates to false because TASK-23 set customTitle:true. That blocks the AI auto-title branch (line 2969 'if (matched && current.aiAutoTitle)'). Worse: lines 2946-2954 promote the first-command title to sessionNameOverrides[sessionId] thinking it was a deliberate user rename. The bug existed in v1.6.x too (same code in v1.6.1) - the user's framing of 'regression in v1.7.0' matches when TASK-71 (e4e2eb9) made the override sync persistent and visible (notification body), making the symptom more obvious. Fix: distinguish first-command auto-titles from explicit user renames using a new firstCommandTitle flag on TerminalInstance, so the AI-link path only respects user-set names.

Bisect result: the bug existed since commit 3217ec0 (TASK-23 'pane-title from first command', shipped pre-v1.6.0). v1.6.1 also exhibits the same broken behavior (verified by running the new spec against the existing out-e2e v1.6.1 package - same 2 of 4 tests fail). The user filed it as a v1.7.0 regression because TASK-71 (e4e2eb9) made the symptom visible in OS notification toasts (the wrongly-captured first-command override now flows through to main). Fix landed in this worktree's commit (TBD). The TS error count was already 29 in this worktree (37 in main, due to the user's pending CopilotPanel.tsx/TabBar.tsx mods); my change keeps it at 29 - no new errors.

Pre-fix spec result against out-e2e v1.6.1 package: tests 1+2 fail (regression confirmed). Post-fix spec result against out-next v1.7.0+fix package: 4/4 pass. Related specs pr75-session-rename-title and task-71-notification-rename-override still pass post-fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-88 / GH #85: pane title no longer fixates on the first shell command when an AI session attaches.

What was wrong:
TASK-23 (commit 3217ec0, shipped pre-v1.6.0) auto-renames a pane to the user's first command (e.g. 'cd C:\') and sets customTitle:true so OSC titles don't override. terminal-store.updateTerminalTitleFromSession then derived 'aiAutoTitle' as '!current.customTitle' - which evaluated to false because TASK-23 had set customTitle:true. That blocked the AI auto-title branch, leaving the pane stuck on 'cd C:\'. Worse, the pendingOverride logic captured the first-command title into sessionNameOverrides as if it were a deliberate user rename - and once TASK-71 (e4e2eb9) synced sessionNameOverrides to main for OS notifications in v1.7.0, the bad override leaked into notification bodies too, which is what made the user notice the regression now.

Bisect: the title bug itself dates back to commit 3217ec0 (TASK-23) - v1.6.1 has the same broken behaviour (verified by running the new spec against the existing out-e2e v1.6.1 package - 2 of 4 tests fail there). v1.7.0 simply made the symptom more visible via TASK-71's override-sync.

Fix:
- types.ts: new optional 'firstCommandTitle' flag on TerminalInstance to mark titles auto-derived from the first command (vs deliberate user renames). Both flow types still need customTitle:true to block OSC overrides; the new flag tells the AI-link path which is which.
- terminal-store.ts renameTerminal: accepts an opts.firstCommand flag, sets firstCommandTitle accordingly, and crucially does NOT propagate first-command renames into sessionNameOverrides (only deliberate renames do).
- terminal-store.ts updateTerminalTitleFromSession: distinguishes a real user rename ('hasUserRename = customTitle && !firstCommandTitle') from a first-command auto-title. Only real user renames suppress aiAutoTitle and get promoted into sessionNameOverrides. AI sessions clear firstCommandTitle on link so subsequent UI renames are treated as deliberate.
- TerminalPanel.tsx: TASK-23's first-command rename callsite now passes { firstCommand: true }.

Precedence post-fix:
1. Explicit user rename (sessionNameOverrides) - wins.
2. AI-session topic (session.summary) - wins over first-command title.
3. First-command title (TASK-23) - shell panes fallback when no AI session.
4. Generic OSC title - shell default.

User impact:
- Open a fresh terminal, type 'cd somewhere', start a Claude Code / Copilot CLI session - the pane title now flips to the session topic (matching pre-TASK-23 behaviour).
- OS notifications no longer surface 'cd <path>' as the session label.
- Existing user renames (FloatingRenameInput, TabBar rename, context-menu rename) continue to win - no PR75 / TASK-71 regression.
- Pure shell panes still get the first-command title - no TASK-23 regression.

Tests:
- New spec: tests/e2e/task-88-first-cmd-title-not-blocking-ai.spec.ts (4 cases): AI overrides first-cmd title; first-cmd title not promoted to overrides; explicit rename still wins; shell pane keeps first-cmd title.
- Pre-fix (out-e2e v1.6.1 package): 2 of 4 fail (regression reproduced).
- Post-fix (out-next v1.7.0+fix package): 4/4 pass.
- pr75-session-rename-title.spec.ts: 2/2 pass.
- task-71-notification-rename-override.spec.ts: 3/3 pass.
- TS error count: 29 -> 29 (worktree baseline; main-tree baseline of 37 includes the user's in-flight CopilotPanel.tsx / TabBar.tsx edits not in this worktree).

Files changed:
- src/renderer/state/types.ts
- src/renderer/state/terminal-store.ts
- src/renderer/components/TerminalPanel.tsx
- tests/e2e/task-88-first-cmd-title-not-blocking-ai.spec.ts (new)
<!-- SECTION:FINAL_SUMMARY:END -->
