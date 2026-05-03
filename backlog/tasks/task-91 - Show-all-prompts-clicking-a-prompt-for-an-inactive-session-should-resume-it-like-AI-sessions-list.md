---
id: TASK-91
title: >-
  Show all prompts: clicking a prompt for an inactive session should resume it
  (like AI sessions list)
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-03 15:32'
updated_date: '2026-05-03 15:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the prompt search dialog (Ctrl+Shift+Y) or the 'Show all prompts' surface, when a user clicks a prompt belonging to a session that is NOT currently open in any pane, today the dialog opens the session summary popover (or, after TASK-86, spawns a new pane in the session's cwd with no AI command). User wants the click to act like 'Resume' on the AI sessions sidebar - open a new pane and launch the AI CLI with --resume <sessionId> so the conversation continues right where it left off. Same model as the existing AI sessions resume button. Should work for both Claude Code and Copilot CLI sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking a prompt search result for a session with no open pane spawns a new pane in the session's cwd AND auto-runs the AI CLI's resume command for that session
- [x] #2 Behavior matches the AI sessions sidebar Resume action (same shellProfile, same flags)
- [x] #3 Works for both Claude Code (--resume <id>) and Copilot CLI (whatever its resume command is)
- [x] #4 If the session ID is unknown to the CLI for any reason, fall back to opening the pane without resume (current TASK-86 behavior)
- [x] #5 Existing keyboard flow (arrows + Enter) and click-anywhere-on-row both trigger the resume
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PromptSearchDialog.jumpTo now routes inactive-session clicks through openCopilotSession / openClaudeCodeSession (provider-aware). Those actions invoke the existing openAiSession() helper which spawns a new pane with '<cmd> --resume <sessionId>' as startup command - exactly the same flow as the Resume button on the AI sessions sidebar. cwd-relative fallback (TASK-86) preserved for the rare case where the session isn't in the live list at all.
<!-- SECTION:FINAL_SUMMARY:END -->
