---
id: TASK-260
title: Prompt Editor still seeds a lone '>' from an indented (boxed) empty input
status: Done
assignee: []
created_date: '2026-06-22 07:05'
updated_date: '2026-06-22 07:06'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-255. Opening the Prompt Editor on an AI CLI pane with an empty input box seeded the editor with a lone '>' instead of empty. The prompt-marker strip ran BEFORE the dedent, and its ^[>] regex is anchored at column 0, but a real input box indents the > marker (box left border cleans to leading spaces), so the strip missed it and the dedent left the bare '>'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Empty boxed AI-CLI input (indented '>') seeds an empty editor, not '>'
- [x] #2 Boxed input with text strips the indented marker and keeps the typed text
- [x] #3 Existing shell-prompt / soft-wrap / mid-response cases still pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the leading shell/inline-prompt strip in extractInputLineFromBuffer to run AFTER the dedent, so an input box that indents its '>' marker has the marker at column 0 when stripped. Added 2 regression tests (indented empty box -> '', indented '> fix the bug' -> 'fix the bug'); all 7 tests in task-255-input-line-extraction.test.ts green. terminal-registry.ts typechecks clean (pre-existing unrelated TS errors elsewhere untouched).
<!-- SECTION:FINAL_SUMMARY:END -->
