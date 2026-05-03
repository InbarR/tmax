---
id: TASK-81
title: >-
  Regression: pasted clipboard images no longer embed into AI agent input (used
  to work)
status: To Do
assignee:
  - '@inbarr'
created_date: '2026-05-03 13:02'
updated_date: '2026-05-03 15:09'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user Ctrl+V's a clipboard image into tmax, the renderer's clipboardSaveImage saves the PNG to <tmpdir>/tmax-clipboard/<basename>.png and types the path into the PTY. Whatever app is on the other end (Claude Code, Copilot CLI, plain shell) receives just the path as text. Claude Code does NOT auto-embed an image from a pasted path - it sees the literal string. Result: when the user pastes a screenshot intending the AI to look at it, the AI ends up with no image at all (only sees the path text), and has to manually Read the file path to surface the image. That's a sharp edge in the AI-pane workflow. Possible directions: (1) detect when the focused pane is running Claude Code / Copilot CLI and use the agent's own image-attach syntax instead of plain path; (2) add a tmax-side option that wraps the path in a marker the agent recognizes; (3) coordinate with the agent's CLI to define a 'paste image' protocol; (4) at minimum, make the path easier for the agent to interpret (already works via my Read tool, but only after the user knows to ask).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pasting a clipboard image into a Claude Code pane makes the image visible to the AI without the user having to ask the AI to Read the file
- [ ] #2 Same flow works for Copilot CLI panes (its own image-attach syntax if any)
- [ ] #3 Pasting into a plain shell pane (no AI) keeps the current behavior - path inserted as text
- [ ] #4 Behavior is opt-in or auto-detected, not requiring the user to remember which mode is active
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-03: User reports this is a regression - the flow used to embed images into Claude Code as image content, now Claude Code only sees the literal path text. Bisect needed to confirm tmax-side vs Claude Code CLI side. Likely tmax suspects: TASK-61 (rich-text paste) or TASK-66 (right-click image-only) - though both commits claim image-only Ctrl+V was preserved. If it bisects to no tmax change, file with Anthropic for the Claude Code CLI side.
<!-- SECTION:NOTES:END -->
