---
id: TASK-270
title: Raycast-style UI modernization for dialogs and panels
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-11 15:28'
updated_date: '2026-07-11 15:28'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Updated all overlay dialogs and the sessions panel to a consistent Raycast-inspired visual style: glass backdrop with blur, slide-in animation, rounded corners (radius-lg), wider layouts, larger search inputs, subtle borders, and improved spacing. Covers: Command Palette, Switcher, PromptSearchDialog, InputDialog, ShortcutsDialog, AI Prompts dialog, and AI Sessions panel (tabs, sort header, card spacing, group headers).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Command Palette uses Raycast-style glass backdrop, slide-in animation, 640px width
- [x] #2 Switcher dialog matches palette style (blur, rounded corners, animation)
- [x] #3 InputDialog matches palette style
- [x] #4 PromptSearchDialog matches palette style
- [x] #5 ShortcutsDialog matches palette style
- [x] #6 AI Sessions panel has cleaner tabs, sort header, and card spacing
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Modernized all overlay dialogs and the sessions panel CSS to a consistent Raycast-inspired style. Glass backdrop with 24px blur, palette-slide-in animation, 12px rounded corners, wider layouts, transparent input backgrounds, subtle borders. Updated: palette, switcher, InputDialog, PromptSearchDialog, ShortcutsDialog, AI Prompts dialog, sessions panel tabs/sort/cards/groups.
<!-- SECTION:FINAL_SUMMARY:END -->
