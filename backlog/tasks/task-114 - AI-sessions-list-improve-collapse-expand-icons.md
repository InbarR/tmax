---
id: TASK-114
title: 'AI sessions list: improve collapse/expand icons'
status: Done
assignee: []
created_date: '2026-05-04 20:26'
updated_date: '2026-05-04 20:26'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replaced the unicode triangles (▸ / ▾) used for the collapse-all toggle and per-group chevron in the AI Sessions list with crisp inline SVG chevrons that render consistently regardless of UI font / DPI. Per-group icon rotates -90deg when collapsed, smooth 0.15s transition. Top-of-list 'collapse all' toggle now uses two stacked chevrons (visually distinct from the per-group single chevron) and flips 180deg between collapse-all and expand-all states.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Top collapse-all toggle uses an SVG chevron-pair icon, rotates 180deg on state change
- [x] #2 Per-group chevron uses an SVG single chevron, rotates -90deg when group is collapsed
- [x] #3 Both icons inherit currentColor and follow the existing dim/secondary text palette
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CopilotPanel.tsx: replaced "▸/▾" unicode for the all-toggle button at the AI sessions header and the per-group header chevrons with inline SVGs.
- All-toggle: two stacked chevrons (distinct from the per-group single chevron). Rotates 180deg between collapse-all and expand-all states.
- Per-group: single chevron. Rotates -90deg when collapsed.
- Both: 0.15s transform transition, currentColor stroke, lineCap/lineJoin round so the chevrons render crisp at any UI scaling.
global.css: .ai-session-group-chevron now uses inline-flex centering (was inline-block + font-size). Added :hover styling for the all-toggle to follow the existing button hover convention.
<!-- SECTION:FINAL_SUMMARY:END -->
