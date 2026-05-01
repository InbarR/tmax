---
id: TASK-51
title: Sessions list - selected session highlight too similar to hover
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 08:05'
updated_date: '2026-05-01 08:47'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the Sessions list (CopilotPanel), the selected/active session row uses a background tint that is nearly identical to the row-hover background, so users cannot tell which session is currently open. Should be visually distinct: e.g. stronger background tint, accent left-border bar, bolder text, or a clear separator. The blue tick stripe on the left edge in the screenshot is too thin and easy to miss. Repro: open multiple sessions in the list, hover one row, compare to the active row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selected/active session row is visually distinct from a hovered row at a glance
- [x] #2 Hover state still provides feedback but does not compete with selection
- [x] #3 Works in all themes (light, dark, midnight)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Split CSS: hover gets subtle 0.05 bg; selected gets stronger 0.18 bg + inset box-shadow + border-left + bolder font weight on .ai-session-name.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
global.css .ai-session-item:hover and .ai-session-item.selected now use distinct backgrounds (0.05 vs 0.18 + inset box-shadow + border-left); selected .ai-session-name is font-weight 600. Hover and selected are clearly distinguishable.
<!-- SECTION:FINAL_SUMMARY:END -->
