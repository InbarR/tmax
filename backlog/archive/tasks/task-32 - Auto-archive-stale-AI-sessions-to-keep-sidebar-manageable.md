---
id: TASK-32
title: Auto-archive stale AI sessions to keep sidebar manageable
status: Done
assignee: []
created_date: '2026-04-28 09:43'
updated_date: '2026-04-28 10:32'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported via screenshot on 2026-04-28. The AI Sessions sidebar shows 252 Active / 2 Completed / 42 Archived. Most active sessions are old, many have only 1 prompt, and the volume makes it hard to find a session by scrolling.

The sidebar pulls sessions from on-disk Copilot CLI / Claude Code transcripts. Nothing currently auto-ages them out, so the list grows unboundedly. User has to right-click and Archive each one manually.

Possible designs:
- Time-based auto-archive: any session whose last activity is older than N days (default 14? configurable) flips to Archived on app start.
- Activity-based: sessions with <2 prompts and no tool calls older than 1 day auto-archive (catches the long tail of opened-then-abandoned).
- Combine both.
- Settings UI to set the threshold and an opt-out.

Tradeoff: archive isn't deletion - the data stays on disk. So this is purely about sidebar noise, low risk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App applies an auto-archive rule on startup based on a configurable threshold
- [ ] #2 Threshold and rule are configurable from settings (or at minimum from config.yml / config JSON)
- [x] #3 User-pinned sessions are never auto-archived
- [x] #4 Auto-archive does not delete the underlying transcript files
- [x] #5 Add a 'Last auto-archived: N sessions on YYYY-MM-DD' breadcrumb somewhere users can see what was hidden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented an MVP that runs after each session load and applies two rules: (1) lastActivityTime older than aiAutoArchiveDays (default 14), (2) messageCount<2 and toolCallCount==0 and last activity older than aiAutoArchiveLowActivityDays (default 1). Pinned sessions are skipped. Existing lifecycle overrides are preserved (user choices win).

Breadcrumb is a console.info + diagLog only - a proper toast / status-bar surface for "Auto-archived N sessions" was deferred to keep this commit small. AC #2 (settings UI) deferred to follow-up - thresholds are config-only for now (aiAutoArchiveDays / aiAutoArchiveLowActivityDays).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AI Sessions sidebar now auto-archives stale sessions on app start.

Why: user reported 252 Active sessions making the list unscrollable; most were old or one-shot abandoned.

Rule (config-overridable):
- Last activity older than aiAutoArchiveDays (default 14) -> archive
- messageCount<2 AND toolCallCount==0 AND last activity older than aiAutoArchiveLowActivityDays (default 1) -> archive

Pinned sessions are never auto-archived. Existing lifecycle overrides are never overwritten - the user's manual archive/un-archive wins. Underlying transcript files are untouched (archive is a UI lifecycle, not deletion). Count is logged to console + diagLog as a breadcrumb; a proper toast is a follow-up.\n\nFiles:\n- src/renderer/state/terminal-store.ts: new autoArchiveStaleSessions action; called from loadCopilotSessions and loadClaudeCodeSessions.
<!-- SECTION:FINAL_SUMMARY:END -->
