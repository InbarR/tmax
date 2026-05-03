---
id: TASK-79
title: Improve discoverability of pane multi-select + 'Show Selected' filter
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 12:57'
updated_date: '2026-05-03 14:55'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-72 restored Ctrl+click multi-select on pane title bars and added 'Show Selected Panes' / 'Show All Panes' / 'Clear Pane Selection' to the Command Palette. The user reports the flow isn't very friendly or discoverable - nothing in the UI hints that you can Ctrl+click a pane title, and the only way to trigger the filter is the Command Palette. Want a more obvious affordance. Options: (1) checkbox/toggle on the pane title bar that's always visible in workspaces mode; (2) a 'Filter' or 'Show Selected' button in the workspace tab/toolbar that lights up when a selection exists; (3) onboarding tooltip that explains Ctrl+click the first time the user enters workspaces mode; (4) default keybinding for 'Show Selected' so power users can just hit a key; (5) right-click context-menu entry on the title bar. Pick whichever combination feels least intrusive but most discoverable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 From a fresh state, a new user can discover multi-select without reading docs or opening the Command Palette
- [x] #2 There is a visible affordance for 'Show Selected' that appears when a selection exists
- [x] #3 Power users still have a fast path (keybinding or palette) - whichever was added does not slow down existing workflow
- [x] #4 Workspaces mode without any selection has no extra visual clutter introduced by the new affordance
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Investigate WorkspaceTabBar, TerminalPanel, terminal-store, TabContextMenu and CSS to confirm wiring points.
2. Add a Show-Selected toolbar button to WorkspaceTabBar that only renders when there is a multi-selection (count >= 2) OR when the selected-only filter is active. Button toggles the filter on/off and shows the count.
3. Add a small clear-selection X next to the toolbar button so users can drop the selection without the palette.
4. Add right-click context-menu entries on the pane title bar (TabContextMenu) - Select/Deselect Pane, Show Selected (N), Show All Panes - so users who do not know the Ctrl+click gesture still discover the action. These entries only render when tabMode is workspaces.
5. CSS: style the new toolbar button, lit when active, with an amber accent matching the existing .multi-selected ring; subtle when ready.
6. Cross-platform: use isMac ? metaKey : ctrlKey wherever click modifiers matter (we are not adding any new shortcuts).
7. Confirm baseline TS error count stays at 37.
8. Write a Playwright spec covering the toolbar button visibility, click-to-filter, click-to-restore, and the right-click menu entries.
9. Mark ACs, write final-summary, set Done, commit with Co-Authored-By: Claude Opus 4.7.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added discoverable Show Selected toolbar button to WorkspaceTabBar (lit when filter is active). Renders only when selectionCount >= 2 so workspaces mode without a selection has zero new clutter.
- Added Select / Deselect / Show Selected / Show All / Clear entries to TerminalPanel pane overflow menu (gated on tabMode === workspaces).
- Skipped TabContextMenu (flat-tabs mode) and the first-time tooltip (toolbar + pane menu cover discoverability).
- Filter-active heuristic: viewMode === grid && preGridRoot && selectionCount >= 2. The selectionCount guard rules out false positives from a regular grid<->focus toggle (which leaves selection empty).
- TS error count unchanged at 37; vite build clean.
- Wrote tests/e2e/workspaces-show-selected-affordance.spec.ts with 5 tests covering button visibility gating, count display, toggle, clear, and pane-menu entries. Not executed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the TASK-72 multi-select / Show-Selected filter discoverable without docs or the Command Palette.

What changed
- WorkspaceTabBar now renders a "Show Selected (N)" toolbar button (right-aligned, amber accent matching the .multi-selected ring) whenever the user has 2+ panes selected. Clicking it engages the filter; the button then re-labels to "Show All" with a brighter active state. A small × sub-button next to it clears the selection without engaging the filter.
- The button is hidden whenever there is no selection (selectionCount < 2). Workspaces mode without a selection looks identical to before this change - no new visual noise (AC #4).
- TerminalPanel's per-pane "⋯" overflow menu now exposes Select pane / Deselect pane / Show selected (N) / Show all panes / Clear pane selection. Each entry is gated on tabMode === 'workspaces' (multi-select is workspace-scoped per TASK-72). The Select/Deselect entry shows a "Ctrl+Click title" shortcut hint so users gradually learn the gesture.
- Filter-active detection: viewMode === 'grid' && preGridRoot && selectionCount >= 2. The selection-count guard rules out the regular grid<->focus toggle (which uses the same plumbing but leaves selection empty).
- Power-user paths preserved: existing palette commands (Show Selected Panes, Show All Panes, Clear Pane Selection) are untouched (AC #3).

Files
- src/renderer/components/WorkspaceTabBar.tsx: store subscriptions for selection / view mode / preGridRoot, conditional toolbar widget.
- src/renderer/components/TerminalPanel.tsx: extra subscriptions, four new overflow-menu entries gated on workspaces mode.
- src/renderer/styles/global.css: .workspace-show-selected, .workspace-show-selected-btn, .workspace-show-selected-dot, .workspace-show-selected-clear styles plus .active variant and a vertical-bar layout adjustment.
- tests/e2e/workspaces-show-selected-affordance.spec.ts (new): five tests covering button hidden-when-empty, button visible with count, toggle on/off, clear-button drops selection, pane-menu Select/Deselect entries.

Cross-platform
- Mac vs Win/Linux: existing Ctrl/Cmd+click on title bar untouched (TASK-72 already used isMac ? metaKey : ctrlKey). The pane-menu shortcut hint shows ⌘ on Mac, Ctrl elsewhere.

Tests
- npx tsc --noEmit: 37 errors, identical to baseline (no new errors introduced).
- npx vite build: clean.
- E2E spec written but NOT executed (per task instructions).

Risks / follow-ups
- The toolbar button only appears when 2+ panes are selected. A user who Ctrl+clicks just one pane gets the .multi-selected ring on that pane but no toolbar button (showSelectedPanes is itself a no-op below 2). That is the correct behavior, but a follow-up could add a "select another pane to filter" hint when count == 1 if the user wants more hand-holding.
- The pane-menu entries appear under "Hide pane" in a new separator block. If we later add many more workspaces-only entries this section may want its own submenu.
<!-- SECTION:FINAL_SUMMARY:END -->
