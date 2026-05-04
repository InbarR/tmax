---
id: TASK-109
title: Empty state with hero + recent AI sessions
status: Done
assignee: []
created_date: '2026-05-04 19:48'
updated_date: '2026-05-04 19:48'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replaced the bare 'Press Ctrl+Shift+N' centered text with a richer empty state: 4-chevron SVG logo (matches assets/icon.png palette), tmax wordmark, primary 'New terminal' action with platform-aware kbd hint, and a 'Resume recent session' list showing the last 5 Copilot+ClaudeCode sessions sorted by latestPromptTime, each row clickable to resume via openCopilotSession/openClaudeCodeSession.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Empty state shows tmax logo and wordmark when no terminals are open
- [x] #2 Primary action button creates a new terminal and shows platform-aware shortcut hint
- [x] #3 Recent sessions list shows up to 5 most recent AI sessions with click-to-resume
- [x] #4 Hidden when at least one terminal exists - only renders in the no-tilingRoot branch of TilingLayout
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New EmptyState component (src/renderer/components/EmptyState.tsx) replaces the single-line text. Hero is a 4-chevron inline SVG mirroring assets/icon.png plus a tmax wordmark. Primary action calls createTerminal() with a platform-aware kbd hint (Ctrl+Shift+N / ⌘⇧N). Recent sessions list pulls from copilotSessions + claudeCodeSessions, sorts by latestPromptTime, takes 5, and renders each as a clickable row with a CC/CP badge, slug-or-repo·branch title, latest-prompt preview, and relative time - click resumes the session via the existing openCopilotSession / openClaudeCodeSession actions. Styles in global.css under the existing /* ===== Empty State ===== */ block.
<!-- SECTION:FINAL_SUMMARY:END -->
