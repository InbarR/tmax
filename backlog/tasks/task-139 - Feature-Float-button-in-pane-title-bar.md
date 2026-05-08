---
id: TASK-139
title: 'Feature: Float button in pane title bar'
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-08 08:40'
updated_date: '2026-05-08 08:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User uses the float pane action often enough to want a top-level button next to the dots overflow menu. Today float/restore lives only inside the dots menu - bump it up to a primary action while keeping the menu entry as a fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Float / Restore button is rendered in the pane title bar adjacent to the dots menu button
- [x] #2 Clicking it toggles float state for that pane (same handler the menu entry uses)
- [x] #3 The menu entry inside dots is preserved (no removal)
- [x] #4 Button icon and tooltip reflect current state (Float vs Restore)
- [x] #5 Button matches the dots button visual size and hover treatment
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Insert a new button before .terminal-pane-menu-btn in TerminalPanel.tsx title bar.
2. Use unicode arrows (no emoji): box-up-right for Float, box-down-left for Restore. Also flip aria-label/title.
3. onClick reuses moveToFloat/moveToTiling (same handler as existing menu entry).
4. CSS: new .terminal-pane-float-btn class mirroring the dots btn (size, hover, hover-revealed). Move margin-left: auto to the float button so the right alignment is preserved.
5. Keep menu entry inside dots untouched.
6. Run npx tsc --noEmit (ignore pre-existing errors), commit on worktree branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added .terminal-pane-float-btn before the dots menu trigger in TerminalPanel.tsx title bar.
- Reuses moveToFloat / moveToTiling - same handlers the menu entry calls.
- Glyphs: U+2B08 (north-east arrow head) for Float, U+2B0B (south-west arrow head) for Restore. Geometric-shapes block, no emoji presentation, renders identically across Win/Mac/Linux.
- title and aria-label flip per state ("Float pane" / "Restore to grid").
- CSS mirrors .terminal-pane-menu-btn (hover-revealed via .terminal-panel:hover/.focused, same transparent background, same hover treatment). margin-left: auto moved onto the float button so the right-aligned button group is preserved.
- Existing menu entry inside dots untouched.
- npx tsc --noEmit: ~30 pre-existing errors, none in my changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Promoted Float / Restore from a dots-menu entry to a top-level button in the per-pane title bar. The menu entry stays as a fallback.

Changes:
- src/renderer/components/TerminalPanel.tsx: new <button class="terminal-pane-float-btn"> rendered just before the dots menu trigger. onClick calls moveToFloat / moveToTiling on the terminal store - the exact handler the existing menu entry already used. title and aria-label switch between "Float pane" and "Restore to grid" based on paneMode. Glyph is U+2B08 (Float) / U+2B0B (Restore) from the geometric-shapes block, picked over emoji to keep rendering identical across Win/Mac/Linux.
- src/renderer/styles/global.css: new .terminal-pane-float-btn rule mirroring .terminal-pane-menu-btn (transparent background, hover-revealed via .terminal-panel:hover and .focused, same hover background). margin-left: auto moved onto the float button (the new first item of the right-edge group) so right-alignment is preserved. Slightly smaller font-size (14px vs 18px) since the arrow glyph carries more visual weight than the dots.

User impact:
- Float / Restore is one click instead of two for users who use it often.
- Discoverability up: button is visible on hover/focus right next to the dots.
- No regression: the dots-menu entry still toggles float exactly as before.

Tests:
- npx tsc --noEmit: ~30 pre-existing errors, none on my changes.
- Per project guidance, no e2e run.
<!-- SECTION:FINAL_SUMMARY:END -->
