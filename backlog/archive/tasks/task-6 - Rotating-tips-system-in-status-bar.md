---
id: TASK-6
title: Rotating tips system in status bar
status: Done
assignee:
  - '@claude'
created_date: '2026-04-26 10:25'
updated_date: '2026-04-26 11:05'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the static 'Ctrl+U: clear input' hint with a Claude-Code-style rotating tips system. The current hint shows during waitingForUser/idle which is most of the time the user is at a prompt - effectively always visible, ignored. Cycle through 15-20 tips covering Ctrl+U, F5 to continue, Ctrl+Shift+K prompts dialog, Ctrl+wheel zoom, broadcast mode, the new pane ⋯ menu, click-to-jump on the banner, etc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TIPS array with at least 15 entries covering key shortcuts and features
- [x] #2 Some tips are AI-session-specific and only show when an AI session is focused
- [x] #3 Tips rotate every 30 seconds
- [x] #4 Eligible tips reset when focused pane changes (AI vs non-AI)
- [x] #5 Always rendered in the status bar center, replacing the static Ctrl+U hint
- [x] #6 Tip styling matches the existing status-dim aesthetic
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add TIPS array (15+ entries) with optional ai-only flag\n2. Filter by current AI-session presence; rotate every 30s\n3. Reset to first eligible tip when AI/non-AI context flips\n4. Render single tip in status-center, replacing static Ctrl+U hint\n5. Reuse status-ctrl-u-hint styling (italic, dim) for visual continuity
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in StatusBar.tsx + global.css. TIPS array has 21 entries covering AI-session features (Ctrl+U, F5, click-to-jump, session summary dot, View summary, pinning, prompts dialog) and global UX (Ctrl+T/W, broadcast, tab bar toggle, view modes, grid columns, Ctrl+wheel zoom, double-click rename, ⋯ menu, drag-to-swap, safelink unwrap, multi-line URLs, hidden-panes indicator). 6 are ai:true and only show when an AI session is focused (AC #2). setInterval rotates tipIndex every 30s (AC #3). useEffect on eligibleTips.length resets tipIndex when AI/non-AI context flips so users never see a stale tip (AC #4). Status-bar center renders the current tip with a 💡 prefix (AC #5). New .status-tip class mirrors .status-ctrl-u-hint (italic, dim, cursor:help) for visual continuity (AC #6).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the always-on 'Ctrl+U: clear input' hint with a rotating tips system covering 21 features. Tips marked ai:true only show when an AI session is focused; they reset to the first tip when the focused pane changes between AI and non-AI so users always start with a relevant hint. Cycle is 30 seconds. Discovery without docs - the same pattern Claude Code uses in its own input footer.
<!-- SECTION:FINAL_SUMMARY:END -->
