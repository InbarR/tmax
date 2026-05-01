---
id: TASK-34
title: >-
  Pane menu: 'Show in AI sessions' opens sidebar with this pane's session
  selected
status: Done
assignee: []
created_date: '2026-04-28 10:17'
updated_date: '2026-05-01 13:09'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a new item to the per-pane ⋯ menu (next to Show prompts / Session summary) that opens the AI Sessions sidebar and highlights the session linked to this pane. Useful when:
- The auto-highlight is wrong (TASK-29 had multiple causes; this is a deterministic manual override)
- The user wants a quick way to reveal a session in the list (e.g. to right-click and rename it, or to navigate to its prompts)

Behaviour:
- Disabled / hidden when the pane has no aiSessionId (regular pwsh / bash pane).
- Click: opens showCopilotPanel and selects the session row, expanding its repo group if collapsed and switching the lifecycle tab if needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pane ⋯ menu shows a 'Show in AI sessions' item when the pane has an aiSessionId
- [x] #2 Item is hidden (or disabled) for panes without an aiSessionId
- [x] #3 Clicking the item opens showCopilotPanel
- [x] #4 Clicking the item leaves the .ai-session-item for this pane'\''s session as the .selected row, even if its group was previously collapsed
<!-- AC:END -->
