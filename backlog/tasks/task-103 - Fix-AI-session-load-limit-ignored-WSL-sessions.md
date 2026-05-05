---
id: TASK-103
title: 'Fix: AI session load limit ignored WSL sessions'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 13:47'
updated_date: '2026-05-04 13:47'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User set aiSessionLoadLimit to 10, expected ~10 sessions to load, but saw 24. Root cause: main.ts IPC handlers passed the limit only to the native CopilotSessionMonitor.scanSessions but pulled WSL sessions unconditionally (no cap), so total per provider = 10 native + N WSL. Across both providers (Copilot + Claude Code) the surprise compounded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 main.ts COPILOT_LIST_SESSIONS combines native + WSL, sorts by lastActivityTime desc, and caps at the requested limit
- [x] #2 main.ts CLAUDE_CODE_LIST_SESSIONS does the same
- [x] #3 Settings.tsx description clarifies the cap is per provider (Copilot and Claude Code each), not global
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix the AI session load limit so WSL sessions are included in the cap.

## Root cause

main.ts IPC handlers (COPILOT_LIST_SESSIONS and CLAUDE_CODE_LIST_SESSIONS) capped only the native monitor scan and concatenated the unrestricted WSL list on top. With limit=10, a user with WSL sessions saw 10 native + N WSL = >10 per provider, plus the other provider doing the same thing.

## Fix

Combine native + WSL per provider, sort by lastActivityTime desc, and slice to the cap. Also clarified the Settings description so users know the cap is per provider (Copilot and Claude Code each), not a global total. With limit=10 and both providers active, the user now sees at most 20 sessions instead of an open-ended overshoot.

## Known limitation

The live session watcher (onSessionAdded) keeps appending new sessions during the run, so the displayed count can still grow past the cap during a long-running app session. That is a separate concern from the initial load cap.
<!-- SECTION:FINAL_SUMMARY:END -->
