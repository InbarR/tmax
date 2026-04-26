---
id: TASK-25
title: Search prompts across all AI panes (Ctrl+Shift+Y)
status: Done
assignee: []
created_date: '2026-04-26 11:42'
updated_date: '2026-04-26 11:43'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User couldn't remember which pane had run a given task. Added a global search dialog that aggregates every Claude Code and Copilot CLI session's prompt history, lets you fuzzy-search, and jumps focus to the linked pane on Enter. Falls back to the session summary popover if the matched session is from another tmax window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New Ctrl+Shift+Y shortcut opens a search dialog
- [x] #2 Dialog aggregates prompts from every Claude Code + Copilot session
- [x] #3 Filter matches against prompt text, pane title, and session folder
- [x] #4 Selecting a row calls setFocus on the linked pane
- [x] #5 Orphan rows (no pane in this window) fall back to opening the session summary
- [x] #6 Entry visible in command palette as Search Prompts Across All Panes
- [x] #7 Entry visible in footer overflow menu as Search prompts
- [x] #8 Rotating footer tip mentions the new shortcut
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a global "find which pane ran this prompt" search.

User flow:
- Press Ctrl+Shift+Y (or pick "Search prompts" from the footer ⋯ menu, or "Search Prompts Across All Panes" in the command palette).
- Type any keyword from a prompt you sent to Claude Code or Copilot CLI.
- Each match shows the prompt text (with the matched term highlighted), the linked pane name, the session folder, and a relative age.
- Enter or click → focuses the pane that ran the prompt. If the session is from another tmax window (no local pane), it falls back to opening the session summary popover.

Implementation:
- New PromptSearchDialog component fetches prompts from every session in parallel via the existing getCopilotPrompts / getClaudeCodePrompts IPC calls and reuses the .switcher CSS chrome.
- Trivial acks (k, ok, continue, etc.) are filtered out.
- Entries are sorted newest-first using each session's lastActivityTime + within-session ordering.
- Footer ⋯ overflow menu and command palette both expose the action; rotating tip mentions the shortcut.
<!-- SECTION:FINAL_SUMMARY:END -->
