---
id: TASK-152
title: 'ClawPilot notification body: strip ''Here is the conversation:'' wrapper'
status: To Do
assignee: []
created_date: '2026-05-16 16:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-151. ClawPilot's continuation turns prepend a 'Here is the conversation:\nuser: ...\nassistant: ...' wrapper to every prompt. stripClawpilotContext currently only removes the trailing '[Clawpilot context: ...]' marker, so once a continuation-turn notification reaches the user, line 1 / line 2 of the body still start with 'Here is the conversation: user: ...' which buries the actual prompt.

For the next ClawPilot notification turn, extract the most recent 'user:' segment (or strip the leading conversation history) so the body shows just the new prompt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stripClawpilotContext (or a sibling helper) strips the 'Here is the conversation:' wrapper template
- [ ] #2 Notification body for a ClawPilot continuation turn shows the latest user prompt, not the wrapper preamble
- [ ] #3 Test fixture for a continuation-turn payload asserts the cleaned body
<!-- AC:END -->
