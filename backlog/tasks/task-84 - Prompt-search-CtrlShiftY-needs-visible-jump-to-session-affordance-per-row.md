---
id: TASK-84
title: Prompt search (Ctrl+Shift+Y) needs visible jump-to-session affordance per row
status: To Do
assignee: []
created_date: '2026-05-03 14:24'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After searching prompts via Ctrl+Shift+Y, the result rows are click-to-jump (click anywhere on a row focuses the linked pane, or opens session summary if no pane is open in this window). User reports the action isn't obvious - there's no visible 'Jump' button or icon on the row, only a tooltip hint. Want a clearer affordance. Options: (1) per-row arrow/icon button on the right edge labeled 'Jump' with a → glyph; (2) split action: 'Jump' button focuses the pane, separate 'Summary' button opens the session summary popover, so users can pick the one they want without relying on the orphan-pane fallback; (3) show the keybinding hint inline ('Enter to jump'). Implementation: PromptSearchDialog.tsx around the row render at line 211.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each result row in the prompt search dialog has a visible jump affordance (icon or button)
- [ ] #2 Hovering the affordance shows a tooltip 'Jump to pane' / 'Show summary' depending on whether the pane is live in this window
- [ ] #3 Existing keyboard-driven flow is preserved: arrow keys + Enter still jumps without mouse
- [ ] #4 Click anywhere on the row still triggers the same default action it does today, so existing muscle memory is not broken
<!-- AC:END -->
