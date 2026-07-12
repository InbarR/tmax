---
id: TASK-273
title: 'Settings panel cleanup: merge Theme into Appearance, emoji icons'
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-12 10:52'
updated_date: '2026-07-12 10:52'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Merged the separate Theme and Appearance tabs into a single Appearance tab (presets at bottom). Replaced monochrome Unicode icons with emojis. Removed dead Theme tab from sidebar. Turtle emoji for Shells.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Theme and Appearance merged into single tab
- [x] #2 Emoji icons in sidebar
- [x] #3 No dead/ghost tab entries
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Merged Theme tab into Appearance (fonts/material first, color presets at bottom). Emoji sidebar icons: 🖥️ Terminal, 🐢 Shells, ⌨️ Keybindings, 🎨 Appearance. Removed dead Theme entry from tab list. Shipped in fb4487e.
<!-- SECTION:FINAL_SUMMARY:END -->
