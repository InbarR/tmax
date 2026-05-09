---
id: TASK-149
title: >-
  Theme system phase 2: chrome theming via CSS variables (tabs, sidebar, status
  bar, panels)
status: Done
assignee:
  - '@inrotem'
created_date: '2026-05-09 18:27'
updated_date: '2026-05-09 18:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 1 (TASK-148) only theme-switches the xterm terminal palette. The visible 'mood' of tmax - tab colors, sidebar bg, status bar bg, panel borders, accent highlights - is hardcoded across global.css. Introduce a small set of chrome CSS variables (--ui-bg, --ui-bg-elevated, --ui-border, --ui-accent, --ui-accent-warm, --ui-running) and route the existing rules through them so theme presets can include a chrome palette and the whole app picks up the look (e.g. claude-terminal.dev's navy+orange feel, not just the terminal area).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A documented set of chrome CSS variables exists and is set on :root by default
- [x] #2 Tabs, status bar, sidebar/panel backgrounds, and accent borders use the variables instead of hardcoded colors
- [x] #3 Theme preset config can override chrome variables in addition to xterm colors
- [x] #4 Existing default look (Catppuccin Mocha-equivalent) is preserved pixel-equivalently when no chrome theme is set
- [x] #5 Warm Dusk preset gains a chrome variant that visibly matches its terminal palette
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phase 2 of theme presets - chrome now responds to the active preset.

The :root block in global.css already defined 8 chrome variables (used 543 times across the file). Rather than refactor every hardcoded color, this change overrides those variables at runtime per preset:

- Moved THEME_PRESETS into src/renderer/utils/theme-presets.ts and added a `chrome` field to each entry containing CSS-variable overrides (--bg-primary, --bg-secondary, --border-color, --focus-border, --text-primary, --text-secondary, --tab-bg, --tab-active).
- Settings → Theme: clicking a preset now sets both the xterm theme (config.theme, persisted) and applies the chrome variables via document.documentElement.style.setProperty (visual only, re-applied on startup).
- App.tsx: a new useEffect watches config.theme and runs applyChromeFromTheme so the chrome stays in sync with the xterm palette across reloads. Detection is by xterm-color equality; if no preset matches, falls back to Catppuccin Mocha chrome (preserves the existing default look pixel-equivalently).
- Catppuccin Mocha chrome: matches the existing :root values exactly. Warm Dusk chrome: dark navy bg/secondary, warm orange (#ee6c4d) focus-border accent, blue-grey text, slate borders.

Limitation: the chrome variable set is the existing 8 in :root - it doesn't yet cover every accent color in the app (e.g. some pane status pills, AI-session badge colors, prompt-search rows still use hardcoded hex). Those can be lifted into the variable set as needed; the pattern is now in place.
<!-- SECTION:FINAL_SUMMARY:END -->
