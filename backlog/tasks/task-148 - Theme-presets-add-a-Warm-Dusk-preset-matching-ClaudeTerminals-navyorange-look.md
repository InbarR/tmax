---
id: TASK-148
title: >-
  Theme presets: add a Warm Dusk preset matching ClaudeTerminal's navy+orange
  look
status: Done
assignee:
  - '@inrotem'
created_date: '2026-05-09 18:23'
updated_date: '2026-05-09 18:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings → Theme today is just 12 color pickers; users have to hand-pick palettes. Add a preset selector at the top of the panel and seed it with at least the existing Catppuccin Mocha and a new Warm Dusk preset (dark-navy background, warm orange/red accents) inspired by claude-terminal.dev's screenshot. Phase 1: terminal colors only (xterm palette). Phase 2 (optional later) extends presets to the tmax chrome (tabs, sidebar, status bar).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Theme settings panel shows a row of preset buttons at the top
- [x] #2 Catppuccin Mocha preset matches the existing default
- [x] #3 Warm Dusk preset uses a dark-navy bg, warm orange/red accents, cyan highlights
- [x] #4 Clicking a preset updates all 12 xterm colors at once and persists via the existing config flow
- [x] #5 Switching presets is reversible (no destructive overwrite of user's custom colors beyond the click action)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add THEME_PRESETS array in Settings.tsx near ThemeSettings: each preset has a label and a complete ThemeColors object.\n2. Seed two presets: 'Catppuccin Mocha' (current default) and 'Warm Dusk' (dark-navy bg, warm orange/red accents, teal cyan).\n3. Add a preset selector row at the top of ThemeSettings - one button per preset, click applies all 12 colors at once via existing updateConfig.\n4. Mark active preset visually by comparing config.theme to each preset.\n5. File a follow-up task for chrome theming (TASK-149) so the screenshot's tab+sidebar+statusbar look can be ported in a separate change.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phase 1 of theme presets: replaced the hand-pick-only color grid in Settings → Theme with a preset row.

- Added THEME_PRESETS array in Settings.tsx with two seeded presets:
  - Catppuccin Mocha (matches the existing default).
  - Warm Dusk (dark navy bg #11192a, warm orange/red cursor + ANSI red, teal cyan, blue-grey foreground) inspired by claude-terminal.dev's screenshot.
- Each preset renders as a button with a 5-swatch preview (bg, fg, red, green, cyan) and the preset name. Active preset (where every color matches the current config) gets a focus-border accent ring.
- Clicking a preset deep-merges all 12 base colors + bright variants via the existing updateConfig flow, so the change persists and is reversible by clicking another preset (or the user can still hand-edit any individual color afterward).

Limitation: phase 1 only swaps the xterm terminal palette. Chrome (tabs, sidebar, status bar) stays Catppuccin-styled regardless of preset because those colors are hardcoded across global.css. TASK-149 was filed to introduce chrome CSS variables and let presets carry a chrome palette too.
<!-- SECTION:FINAL_SUMMARY:END -->
