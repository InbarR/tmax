---
id: TASK-91
title: >-
  Show all prompts: clicking a prompt for an inactive session should resume it
  (like AI sessions list)
status: To Do
assignee: []
created_date: '2026-05-03 15:32'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the prompt search dialog (Ctrl+Shift+Y) or the 'Show all prompts' surface, when a user clicks a prompt belonging to a session that is NOT currently open in any pane, today the dialog opens the session summary popover (or, after TASK-86, spawns a new pane in the session's cwd with no AI command). User wants the click to act like 'Resume' on the AI sessions sidebar - open a new pane and launch the AI CLI with --resume <sessionId> so the conversation continues right where it left off. Same model as the existing AI sessions resume button. Should work for both Claude Code and Copilot CLI sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clicking a prompt search result for a session with no open pane spawns a new pane in the session's cwd AND auto-runs the AI CLI's resume command for that session
- [ ] #2 Behavior matches the AI sessions sidebar Resume action (same shellProfile, same flags)
- [ ] #3 Works for both Claude Code (--resume <id>) and Copilot CLI (whatever its resume command is)
- [ ] #4 If the session ID is unknown to the CLI for any reason, fall back to opening the pane without resume (current TASK-86 behavior)
- [ ] #5 Existing keyboard flow (arrows + Enter) and click-anywhere-on-row both trigger the resume
<!-- AC:END -->
