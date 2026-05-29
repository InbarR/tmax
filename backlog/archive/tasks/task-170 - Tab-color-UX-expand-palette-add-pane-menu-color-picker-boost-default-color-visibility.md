---
id: TASK-170
title: >-
  Tab color UX: expand palette, add pane-menu color picker, boost default-color
  visibility
status: In Progress
assignee:
  - '@claude-agent'
created_date: '2026-05-21 08:01'
updated_date: '2026-05-24 16:27'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three related UX improvements from user report (2026-05-21):

1. TAB_COLORS palette expanded from 10 to 16 swatches: added Pink, Indigo, Brown, Lime, Black, White. The new Black (#000000) is the explicit dark choice users were missing - the existing 'Dark' (#323130) is dark gray, not black.

2. Pane menu (pane title bar ⋯) now has 'Change pane color' with the same inline swatch grid as the tab and workspace context menus. Parity across all three color-picker surfaces.

3. Default tab color (Settings → Appearance → Default tab color) now applies at 80% opacity for focused panes / 67% for unfocused, instead of 40% / 20%. The original tint opacity was tuned for per-pane accents but made the GLOBAL default invisible on dark themes (#000000 at 20% on a dark bg = no visible change). Per-pane colors keep the original lighter tint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Color picker in tab context menu, workspace context menu, and new pane menu all show the full 16-color palette including Black and White
- [x] #2 Pane menu (⋯) has 'Change pane color' entry that expands into the swatch grid; picking applies the color, ✕ clears it, menu closes after
- [x] #3 Setting Default Tab Color to #000000 in Settings → Appearance makes all uncolored panes' title bars visibly black on dark themes
- [x] #4 Per-pane color overrides still use the lighter tint opacity (no regression for users who set per-pane accents)
- [x] #5 Settings → Appearance has a 'Tab color intensity' slider (0-100) with reset to 40
- [x] #6 Slider value applies to all tab tints (per-pane, per-workspace, per-group, default) so users get one knob to manage tint visibility
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Expand TAB_COLORS in terminal-store.ts with Pink/Indigo/Brown/Lime/Black/White\n2. Add per-pane color picker to the overflow menu in TerminalPanel.tsx (parity with tab context menu)\n3. Boost default-color visibility: drop CSS overlay approach, blend tint into xterm theme.background so even slider=100 with #000000 produces a true-black pane\n4. Settings: tabColorIntensity slider 0-100 with quadratic body / linear title / chroma cap so vivid colors stay readable at high intensity, neutrals bypass slider and go fully solid\n5. White/light pane: flip xterm.theme.foreground/cursor to dark when blended bg luminance > 0.55 so text stays readable
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up (2026-05-21): replaced the hardcoded boost-for-default-color with a user-controllable slider. Settings → Appearance → 'Tab color intensity' (0-100, default 40). Drives both focused and unfocused opacity for all tab tints (per-pane and default alike). Default value preserves the original per-pane behavior so existing setups don't regress. Cranking to 100 with #000000 default gives solid black tabs; dialing down to 10 gives barely-visible accents.

Follow-up #2 (2026-05-21): the overlay-based tint capped at ~50% opacity because higher would obscure terminal text. Replaced with a direct xterm theme.background blend: tmax now blends the tint into xterm's own background color (no overlay), so intensity=100 + #000000 produces a true solid-black terminal with readable text on top. Matches the look of Windows Terminal.

Iterated with user. Final state: vivid colors (orange/red/pink) cap body alpha by chroma so they read as accents not walls; neutral colors (black/white/gray) bypass the slider and go 100% solid - 'a black tab is a real black pane regardless of slider'. White / lime panes auto-flip the foreground to dark so text stays readable on light bg. User verified 'colors look good'.

Expanded TAB_COLORS palette to 16 swatches (Pink, Indigo, Brown, Lime, Black, White added). Added defaultTabColor + tabColorIntensity to AppConfig (main + renderer types). Added Change pane color entry to TerminalPanel overflow menu mirroring the TabContextMenu / WorkspaceTabBar swatch-grid pattern, with the ✕ clear button. Added Tab color intensity slider (0-100, default 40) to Settings → Appearance. Replaced fixed-opacity terminal-color-overlay with a computeTabTint helper in terminal-store.ts that blends the tint into xterm.theme.background (so #000000 at intensity 100 paints a real solid-black pane); flips xterm fg/cursor to dark when blended luminance > 0.55 so White/Lime panes stay readable. Vivid colors cap their body alpha by chroma so they read as accents; neutrals bypass the cap so users can dial them fully solid. Typecheck baseline preserved at 48 (no new errors).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped all 6 ACs (commit 2b30901 on worktree branch worktree-agent-a4d2d7851d0783b1c, not pushed). Changes:

- TAB_COLORS palette expanded 10 -> 16 (added Pink, Indigo, Brown, Lime, Black, White).
- Pane overflow menu (TerminalPanel.tsx) now has 'Change pane color' with the inline swatch grid + clear button, matching tab/workspace context menus.
- Settings -> Appearance has a 'Tab color intensity' slider (0-100, default 40) persisted on config as tabColorIntensity. Drives all tab tints.
- Replaced the .terminal-color-overlay div with a real xterm theme.background blend via a new computeTabTint() helper. Vivid colors cap body alpha by chroma; neutrals bypass so #000000 at intensity 100 paints solid black.
- Foreground/cursor flip to dark when blended bg luminance > 0.55, keeping White/Lime panes readable.
- defaultTabColor and tabColorIntensity properly typed on AppConfig.

Typecheck baseline preserved (no new errors). Not pushed - awaiting user review.
<!-- SECTION:FINAL_SUMMARY:END -->
