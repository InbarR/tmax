---
id: TASK-30
title: >-
  Float toggle round-trip restores original tile layout (currently flattens grid
  into row)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-04-28 09:03'
updated_date: '2026-04-28 10:07'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported via screenshots on 2026-04-28. With a 2x2 grid, focusing one pane and pressing Ctrl+Shift+U twice (toggleFloat -> back to tiled) destroys the grid: the pane comes back as a horizontal split next to its tab-neighbour, turning the 2x2 into a 1x4 row.

Root cause: src/renderer/state/terminal-store.ts moveToFloat (line 1087) drops the leaf via removeLeaf without remembering its parent's split direction/ratio/position. moveToTiling (line 1124) without an explicit target then uses the tab-neighbour heuristic, which always inserts with side='right' or 'left' (horizontal split). So however the leaf was nested originally, it returns as a column.

Fix approach (already approved by user): snapshot anchor info on FloatingPanelState at float-time (sibling anchor leaf id, parent direction, parent ratio, side); on un-float without explicit target, if the anchor is still in the tree, re-insert with the saved direction/side/ratio. If the anchor is gone (user closed/moved tiles during the float), fall back to the current tab-neighbour heuristic.

Reproduce-first per project rule: Playwright test ships with the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Floating a tile from a 2x2 grid and toggling back restores the same 2x2 grid
- [ ] #2 Floating a tile from a vertical (top/bottom) split and toggling back restores the vertical split, not a horizontal one
- [ ] #3 When the original sibling pane is closed during the float, toggling back falls back gracefully (no crash) and re-inserts via tab-neighbour heuristic
- [ ] #4 Existing 'Restore' / wakeFromDormant flows are unaffected (no regressions in moveToTiling explicit-target path)
- [ ] #5 Playwright test added that fails on current main and passes after the fix
- [ ] #6 No regressions in tests/e2e suite
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Survey existing e2e tests for split/float patterns to match conventions.
2. Find layout helpers in tests/e2e (build 2x2 grid, focus pane, query layout structure).
3. Write Playwright test: build 2x2, focus a pane, Ctrl+Shift+U (float), Ctrl+Shift+U (un-float), assert layout still 2x2. Verify it FAILS on current main.
4. Add second Playwright test: vertical split, float bottom, un-float, assert vertical split restored.
5. Implement: extend FloatingPanelState type with optional preFloatAnchor field {siblingId, parentDirection, parentRatio, side}.
6. moveToFloat: before removeLeaf, walk the tree to find the leaf's parent split node, capture sibling subtree's anchor (any leaf id in the sibling), parent direction, splitRatio, and whether this leaf was first or second.
7. moveToTiling: when called without explicit target, check the FloatingPanelState for preFloatAnchor. If present and the anchor leaf still exists in tree, insertLeaf with saved direction, side (mapped from first/second), and ratio. Else fall back to current tab-neighbour heuristic.
8. Run all e2e tests; ensure no regressions in other tiling/floating tests.
9. Manually verify in dev (npm start) - 2x2 grid, vertical split, 3-pane layout all round-trip correctly.
10. Final summary + commit + mark Done.
<!-- SECTION:PLAN:END -->
