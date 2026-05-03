---
id: TASK-84
title: Prompt search (Ctrl+Shift+Y) needs visible jump-to-session affordance per row
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 14:24'
updated_date: '2026-05-03 14:40'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After searching prompts via Ctrl+Shift+Y, the result rows are click-to-jump (click anywhere on a row focuses the linked pane, or opens session summary if no pane is open in this window). User reports the action isn't obvious - there's no visible 'Jump' button or icon on the row, only a tooltip hint. Want a clearer affordance. Options: (1) per-row arrow/icon button on the right edge labeled 'Jump' with a → glyph; (2) split action: 'Jump' button focuses the pane, separate 'Summary' button opens the session summary popover, so users can pick the one they want without relying on the orphan-pane fallback; (3) show the keybinding hint inline ('Enter to jump'). Implementation: PromptSearchDialog.tsx around the row render at line 211.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each result row in the prompt search dialog has a visible jump affordance (icon or button)
- [x] #2 Hovering the affordance shows a tooltip 'Jump to pane' / 'Show summary' depending on whether the pane is live in this window
- [x] #3 Existing keyboard-driven flow is preserved: arrow keys + Enter still jumps without mouse
- [x] #4 Click anywhere on the row still triggers the same default action it does today, so existing muscle memory is not broken
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped: each prompt-search row now has a visible arrow glyph on the right edge that telegraphs clickability. Live-pane sessions get '↗' (jump to pane), inactive ones get '↑' (open summary). Glyph is dim by default (opacity 0.45), brightens to focus-blue and slides slightly on row hover or keyboard selection. Title attribute reflects the action ('Jump to this pane (Enter)' or 'Open session summary (Enter)'). Existing keyboard flow (arrows + Enter) and click-anywhere-on-row behavior are unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
