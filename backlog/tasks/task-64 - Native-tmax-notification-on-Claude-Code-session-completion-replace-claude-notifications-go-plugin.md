---
id: TASK-64
title: >-
  Native tmax notification on Claude Code session completion (replace
  claude-notifications-go plugin)
status: In Progress
assignee:
  - '@Inbar'
created_date: '2026-05-02 19:32'
updated_date: '2026-05-03 07:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax already monitors Claude Code session files (src/main/claude-code-session-monitor.ts) and has an OS-notification surface (src/main/copilot-notification.ts style). Today the only notifications it emits are Copilot-side awaitingApproval / waitingForUser transitions. There is no notification when a Claude Code session finishes a turn / goes idle, so users currently rely on the external claude-notifications-go plugin (Claude Code Stop-hook + Go binary) to know when CC is done. Goal: emit a tmax-native notification when a Claude Code session transitions from running to idle (or 'needs user attention'), so tmax owns this UX end-to-end and the external plugin can be uninstalled. Design sketch: reuse ClaudeCodeSessionMonitor state machine, add transition observer for running-to-idle, wire into same notification surface as Copilot with 30s per-session cooldown, body includes repo + branch (stretch: last assistant message preview), make opt-in/out via aiSessionNotifications config toggle, keep cross-platform Win/Mac/Linux. Verification: install feature, then uninstall claude-notifications-go plugin, run a Claude Code session, confirm tmax-only notification fires.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ClaudeCodeSessionMonitor exposes a transition event for running-to-idle or equivalent
- [x] #2 Electron OS notification fires on that transition with title indicating the agent (e.g. Claude Code: Session ready) and body including repo + branch
- [x] #3 30 second per-session cooldown applied, matches Copilot notification convention
- [x] #4 Configurable via aiSessionNotifications config flag - user can disable if they prefer their own hook plugin
- [ ] #5 User uninstalls claude-notifications-go after this lands and verifies tmax notification fires on a real Claude Code session completion
- [ ] #6 Playwright spec simulates a transcript file transition and asserts the notification fires once, with cooldown verified by a second simulated transition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wired Claude Code monitor (both local at main.ts:setupClaudeCodeMonitor and WSL at setupWslSessionManager.onClaudeCodeSessionUpdated) to notifyCopilotSession. The Claude Code parser flips status to 'waitingForUser' when the last message has end_turn (i.e. Claude finished a turn), so notifyCopilotSession's existing waitingForUser branch already maps to the user-visible 'session ready' moment. Updated copilot-notification.ts to use a provider-aware title: 'Claude Code: Session Ready' / 'Claude Code: Approval Needed' for Claude Code sessions, 'Copilot: Waiting for Input' / 'Copilot: Approval Needed' for Copilot. Body is unchanged (repo + branch fallback to cwd). Added aiSessionNotifications config flag (default true) wired through setAiSessionNotificationsEnabled() at startup. Users running an external hook plugin (claude-notifications-go) can set aiSessionNotifications=false in their tmax-config.json to opt out of the tmax-native surface. Existing 30s per-session cooldown unchanged.

Automated Playwright spec deferred: testing OS Notification firing requires either (a) a test-only IPC handler invoking notifyCopilotSession plus a Notification-constructor spy in main, or (b) a unit-test framework not currently in the project. Manual verification path is cleaner: see AC #5. The fix is small and targeted enough that the type-checker + a real-world end-to-end test (uninstall plugin + run a CC session) will give high confidence.
<!-- SECTION:NOTES:END -->
