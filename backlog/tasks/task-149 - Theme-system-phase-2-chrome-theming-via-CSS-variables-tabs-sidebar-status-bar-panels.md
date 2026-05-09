---
id: TASK-149
title: >-
  Theme system phase 2: chrome theming via CSS variables (tabs, sidebar, status
  bar, panels)
status: To Do
assignee: []
created_date: '2026-05-09 18:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 1 (TASK-148) only theme-switches the xterm terminal palette. The visible 'mood' of tmax - tab colors, sidebar bg, status bar bg, panel borders, accent highlights - is hardcoded across global.css. Introduce a small set of chrome CSS variables (--ui-bg, --ui-bg-elevated, --ui-border, --ui-accent, --ui-accent-warm, --ui-running) and route the existing rules through them so theme presets can include a chrome palette and the whole app picks up the look (e.g. claude-terminal.dev's navy+orange feel, not just the terminal area).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A documented set of chrome CSS variables exists and is set on :root by default
- [ ] #2 Tabs, status bar, sidebar/panel backgrounds, and accent borders use the variables instead of hardcoded colors
- [ ] #3 Theme preset config can override chrome variables in addition to xterm colors
- [ ] #4 Existing default look (Catppuccin Mocha-equivalent) is preserved pixel-equivalently when no chrome theme is set
- [ ] #5 Warm Dusk preset gains a chrome variant that visibly matches its terminal palette
<!-- AC:END -->
