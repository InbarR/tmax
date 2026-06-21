---
id: TASK-255
title: >-
  Prompt Editor seeds agent output instead of the user's input line (AI CLI
  panes)
status: To Do
assignee: []
created_date: '2026-06-21 17:46'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening the Prompt Editor (Ctrl+Alt+E) on an AI CLI pane (Claude Code / Copilot) while the agent is mid-response seeds the editor with the AGENT'S streaming output (e.g. 'Let me verify...', tool calls, 'Considering... thinking') instead of the user's prompt line. Root cause: openPromptComposer seeds from getCurrentInputLine (src/renderer/terminal-registry.ts:61), which walks UP from the cursor over contiguous non-blank rows, stopping only at a blank row, a shell prompt (looksLikePrompt on the line ABOVE), or buffer top. Ink AI CLIs render the input box directly below output with no blank separator and an INLINE prompt marker ('> text'), so the walk-up climbs through the agent output. Proposed fix: (a) stop the walk-up when the CURRENT line is itself an inline prompt line (starts with >/❯/➜/»), so extraction never rises above the input box; and/or (b) when the pane is a known AI CLI that is actively working/busy, return '' (no meaningful input line). Must not regress the shell-prompt and multi-line-input cases - add unit tests for getCurrentInputLine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening the Prompt Editor on a busy AI CLI pane seeds empty (or just the input box text), never the agent's output
- [ ] #2 Inline-prompt input boxes ('> typed text') seed only the typed text
- [ ] #3 Shell prompt + soft-wrapped + multi-line input extraction is unchanged (regression tests)
<!-- AC:END -->
