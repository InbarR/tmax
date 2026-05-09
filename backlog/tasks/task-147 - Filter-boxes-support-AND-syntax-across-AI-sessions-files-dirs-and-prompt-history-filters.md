---
id: TASK-147
title: >-
  Filter boxes: support AND syntax across AI sessions, files, dirs, and
  prompt-history filters
status: Done
assignee:
  - '@inrotem'
created_date: '2026-05-09 17:39'
updated_date: '2026-05-09 17:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-133 added AND-token syntax to the prompt search dialog. Bring the same UX to every other filter input in the app: the AI Sessions panel, FileExplorer, DirPanel, and any other in-app filter box. A user typing 'foo AND bar' should see only items matching both tokens (case-insensitive). Extract a small shared utility so all filters use the same parsing/matching logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI Sessions filter supports 'foo AND bar' syntax (all tokens must match)
- [x] #2 FileExplorer filter supports the same AND syntax
- [x] #3 DirPanel filter supports the same AND syntax
- [x] #4 Any other in-app filter box (worktrees, etc) uses the same syntax
- [x] #5 Tokenization is shared via a single utility, not duplicated per component
- [x] #6 Single-token searches still work as before (no regression)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted the AND-token filter from PromptSearchDialog into a shared utility (`src/renderer/utils/and-filter.ts`) and wired it into every other in-app filter so the syntax behaves the same everywhere. SQLite-backed AI session search already supports AND/OR via FTS5 and was left untouched.

Sites updated to use the shared helpers (tokenizeAnd + matchesAllTokens):
- `DirPanel` (recent/favorite directories)
- `DirPicker` (dir picker dialog)
- `FileExplorer` (file tree filter)
- `DiffReview` (changed-files filter)
- `CommandPalette` (command label + shortcut)
- `TerminalSwitcher` (jump-to-terminal)
- `CopilotPanel` (prompt history popover)
- `PromptSearchDialog` (refactored to call the same util)

A user typing 'foo AND bar' in any of these now requires every token to match (case-insensitive substring). Single-token searches still match a single substring like before.
<!-- SECTION:FINAL_SUMMARY:END -->
