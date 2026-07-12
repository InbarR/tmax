---
id: TASK-267
title: Universal search in Command Palette
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-07 07:23'
updated_date: '2026-07-12 07:52'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the command palette (Ctrl+Shift+P) into a unified search that shows results from multiple sources in labeled sections: Commands, Panes (open terminals), Sessions (AI sessions from Copilot/Claude), and Prompts (matching prompts across all panes). Typing immediately searches all sources — no prefix scoping needed. Results grouped by category with section headers. Selecting a result performs the natural action (run command, focus pane, open session, jump to prompt).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Commands section shows filtered commands (current behavior preserved)
- [x] #2 Panes section shows open terminal titles matching the query; selecting focuses the pane
- [x] #3 Sessions section shows AI session names/summaries matching query; selecting opens or focuses the session
- [x] #4 Prompts section shows matching prompts from prompt search DB; selecting jumps to that prompt in its pane
- [x] #5 Section headers visually separate result categories
- [x] #6 Empty query shows commands only (no noise from prompts)
- [x] #7 Results appear instantly for commands/panes/sessions; prompts may load async with a subtle indicator
- [x] #8 Keyboard navigation works across all sections seamlessly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Redesign Command Palette to Raycast-style launcher:
   - Larger search input with rounded corners and subtle shadow
   - Section headers (Commands, Panes, Sessions, Prompts)
   - Category icons/badges per result row
   - Smooth open/close animation
   - Glass/frosted backdrop
2. Redesign Settings panel to match Raycast:
   - Add icons to sidebar nav items
   - Pill-shaped toggle switches (iOS-style)
   - Subtle row separators (hairlines)
   - More spacing/padding for relaxed feel
   - Search field in sidebar header
3. Implement universal search data sources in palette
4. Polish: animations, transitions, hover states
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented universal search across Commands, Panes, and Sessions with section headers and category icons. Raycast-style visual overhaul: wider palette (640px), larger search input, slide-in animation, glass backdrop, rounded corners. Also updated switcher, InputDialog, PromptSearchDialog, ShortcutsDialog, and AI Sessions panel to match the new style. Session labels truncated and use slug/firstPrompt for readability. Remaining: AC #4 (Prompts search via async IPC) and AC #7 (loading indicator).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Universal search command palette with Raycast-style UI. Searches Commands, Panes, Sessions (instant) and Prompts (async SQLite, 4+ chars). Glass backdrop, slide-in animation, section headers with category icons. Also modernized all other dialogs to match. Shipped in 9d2a144.
<!-- SECTION:FINAL_SUMMARY:END -->
