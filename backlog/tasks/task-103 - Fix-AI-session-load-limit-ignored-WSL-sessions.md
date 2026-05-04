---
id: TASK-103
title: 'Fix: AI session load limit ignored WSL sessions'
status: To Do
assignee: []
created_date: '2026-05-04 13:47'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User set aiSessionLoadLimit to 10, expected ~10 sessions to load, but saw 24. Root cause: main.ts IPC handlers passed the limit only to the native CopilotSessionMonitor.scanSessions but pulled WSL sessions unconditionally (no cap), so total per provider = 10 native + N WSL. Across both providers (Copilot + Claude Code) the surprise compounded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 main.ts COPILOT_LIST_SESSIONS combines native + WSL, sorts by lastActivityTime desc, and caps at the requested limit
- [ ] #2 main.ts CLAUDE_CODE_LIST_SESSIONS does the same
- [ ] #3 Settings.tsx description clarifies the cap is per provider (Copilot and Claude Code each), not global
<!-- AC:END -->
