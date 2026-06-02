---
id: TASK-146
title: >-
  Session timeline: read-only transcript of AI prompts with timestamps (CC +
  Copilot)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-02 12:07'
updated_date: '2026-06-02 12:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Issue #124 asked for timestamps on the chat. Since the AI CLIs (Claude Code, Copilot) render their own conversation, tmax can't timestamp the live output - but tmax already reads the session files (which carry a per-message timestamp). Add a read-only 'session timeline' panel that lists each user prompt for a session with its timestamp, for BOTH Claude Code and Copilot. Sourced from session files; AI sessions only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A timeline view shows each user prompt of a session with an absolute timestamp
- [ ] #2 Works for both Claude Code and Copilot sessions
- [ ] #3 Read-only; opened from an existing session affordance (e.g. session summary / AI sidebar)
- [ ] #4 Gracefully handles sessions with no prompts / unreadable files
<!-- AC:END -->
