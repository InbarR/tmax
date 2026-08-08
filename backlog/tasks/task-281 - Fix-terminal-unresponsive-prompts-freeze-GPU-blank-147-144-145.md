---
id: TASK-281
title: 'Fix terminal unresponsive, prompts freeze, GPU blank (#147 #144 #145)'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-08-08 16:04'
updated_date: '2026-08-08 16:04'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three open issues fixed in one commit: ConPTY wake on visibility/focus, async prompt extraction to unblock main thread, GPU context loss detection + auto-repaint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Terminal wakes from ConPTY stall on visibility/focus return
- [x] #2 Prompt extraction uses async fs.promises.readFile
- [x] #3 GPU context loss triggers automatic terminal refresh
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TerminalPanel: resize signal on focus/visibility to wake stalled ConPTY. Made COPILOT_GET_PROMPTS/CLAUDE_CODE_GET_PROMPTS IPC handlers async with extractCopilotPromptsAsync/extractClaudeCodePromptsAsync. Added webglcontextlost listener + forced refresh on visibility change. All three GitHub issues commented and closed.
<!-- SECTION:FINAL_SUMMARY:END -->
