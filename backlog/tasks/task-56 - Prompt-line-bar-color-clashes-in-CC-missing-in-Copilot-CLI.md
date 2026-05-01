---
id: TASK-56
title: 'Prompt-line bar - color clashes in CC, missing in Copilot CLI'
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 13:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-48 highlights ^> lines with bright green. Color clashes with CC theme; Copilot CLI uses a different chevron char (› U+203A) so the regex misses it entirely.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Copilot CLI > prompt lines get the bar
- [ ] #2 Color matches the theme accent rather than bright green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Extend regex to ^[>\u203A\u276F]\\s; switch decoration backgroundColor to themeConfig.cursor (focus accent).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PROMPT_RE now matches `>` (Claude Code/generic), `›` U+203A (Copilot CLI), and `❯` U+276F (Starship). Bar color is themeConfig.cursor (theme accent) instead of #7CB342 green.
<!-- SECTION:FINAL_SUMMARY:END -->
