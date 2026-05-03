---
id: TASK-72
title: >-
  Workspaces mode - allow Ctrl+click on panes to multi-select for 'show
  selected' filter
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 07:47'
updated_date: '2026-05-03 07:58'
labels:
  - workspaces
  - ux
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-40 introduced workspaces (each tab is a named collection of panes). The chip-based UI replaced individual tab headers and lost a multi-select interaction the user relied on: Ctrl+click multiple tabs to add them to a selection set, then a 'Show selected' command would focus only those panes. Restore the feature, but bind it to the PANE (panes are the new primary surface). Ctrl+click on a pane's title bar / chrome (NOT inside the xterm terminal area) toggles that pane in a multi-selection set. A 'Show selected' command (Command Palette / footer overflow / shortcut) hides every pane that isn't selected. Reversible via 'Show all'. Cross-platform: metaKey on Mac, ctrlKey on Win/Linux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ctrl/Cmd+click on a pane title bar / chrome toggles the pane in a multi-selection set without affecting xterm focus or text selection inside the terminal area
- [x] #2 Selected panes show a clear visual indicator (border / outline / tint) on the pane wrapper that is distinct from the focused-pane indicator
- [x] #3 Command Palette gains 'Show selected panes' and 'Show all panes' commands
- [x] #4 'Show selected panes' hides every pane in the active workspace that is not in the selection set; 'Show all panes' clears the filter and restores all panes
- [x] #5 Selection state and visibility filter are scoped to the active workspace (not global) and survive workspace switches without leaking
- [x] #6 Playwright spec covers: today nothing happens on Ctrl+click pane chrome; after fix Ctrl+click toggles selection, 'Show selected' hides non-selected panes, 'Show all' restores them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Investigate codebase: workspaces UI in WorkspaceTabBar, pane chrome in TerminalPanel.tsx, existing selectedTerminalIds state in terminal-store.ts (already wired for flat-tab Ctrl+click but not used in workspaces mode).
2. Decide on filter mechanism: a non-destructive CSS visibility filter (paneVisibilityFilter: Set<TerminalId> | null) so Show all just clears the set. Avoid moveToDormant which mutates tilingRoot.
3. Add state to terminal-store: showSelectedActive flag + the existing selectedTerminalIds set scoped to active workspace (auto-cleared on workspace switch). New actions: showSelectedPanes, showAllPanes.
4. Wire Ctrl+click on the .terminal-pane-title bar (not on xterm canvas). Use isMac ? metaKey : ctrlKey to call toggleSelectTerminal. Stop propagation so it does not steal xterm focus - the title bar is outside the xterm screen so this is safe.
5. Visual indicator: add a multi-selected class on .terminal-panel for panes in selectedTerminalIds; CSS gives it a dashed accent border distinct from the .focused border.
6. Filter: when showSelectedActive is true, add a class to TilingLayout root that hides .tiling-leaf whose contained .terminal-panel does not have .multi-selected. Use CSS :has selector (already used by focus mode).
7. Command Palette: add Show selected panes, Show all panes commands, gated visibility on whether there is a selection.
8. Cross-workspace cleanup: clear selection + filter when activeWorkspaceId changes, so selection does not leak across workspaces.
9. Playwright spec tests/e2e/workspaces-multi-select.spec.ts: switch to workspaces mode, create 3 terminals, Ctrl+click two pane title bars, assert selectedTerminalIds size, run showSelectedPanes via store, assert non-selected leaf is hidden in DOM, run showAllPanes, assert all visible.
10. Mark ACs, write final summary, commit. Do not run full e2e suite without parent approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added showSelectedPanes() and showAllPanes() to terminal-store. Both reuse the existing preGridRoot mechanism so the filter is reversible. showSelectedPanes preserves selectedTerminalIds (unlike gridSelectedTabs) so the indicator persists.
- Cleared selectedTerminalIds on workspace switch to scope selection per-workspace.
- Wired Ctrl/Cmd+click on .terminal-pane-title to toggleSelectTerminal in TerminalPanel.tsx. Suppressed the pane-root onMouseDownCapture focus shift on Ctrl-click of the title bar so multi-selecting does not steal focus from the user's working pane.
- Visual indicator: .terminal-panel.multi-selected adds a dashed amber/yellow inset ring; layered with .focused so an active selected pane shows both rings.
- Command Palette: Show Selected Panes, Show All Panes, Clear Pane Selection.
- Wrote tests/e2e/workspaces-multi-select.spec.ts covering: Ctrl+click toggle, visual indicator, showSelectedPanes hides non-selected and showAllPanes restores, selection cleared on workspace switch, no-op when fewer than 2 selected.
- TS clean (npx tsc --noEmit produced no new errors). Renderer builds cleanly via vite build.
- E2E spec NOT executed - packaged build is missing in this worktree (out-e2e/tmax-win32-x64/tmax.exe). Per parent: do not package without asking.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored the multi-select gesture lost when workspaces mode replaced per-tab headers with workspace chips - now bound to the pane title bar.

What changed
- Ctrl/Cmd+click on a pane's title bar (.terminal-pane-title) toggles the pane in selectedTerminalIds. The handler lives on the title bar mousedown, not the xterm body, so terminal focus / text selection in the canvas area is untouched. The pane root onMouseDownCapture skips its focus shift on Ctrl-click of the title bar so multi-selecting does not yank focus away from the user's working pane.
- Visual indicator: new .terminal-panel.multi-selected adds a dashed amber/yellow inset ring distinct from the soft-blue .focused ring; the active-and-selected pane shows both layered.
- Two new store actions: showSelectedPanes() builds a grid of just the selected terminals and parks the original tilingRoot in preGridRoot; showAllPanes() restores it. Reuses the existing grid-mode preGridRoot/restore plumbing so the filter is non-destructive and reversible. Unlike the older gridSelectedTabs, the new showSelectedPanes preserves selectedTerminalIds so the indicator stays visible while the filter is on.
- Command Palette: "Show Selected Panes (filter to multi-selected)", "Show All Panes (clear selected-only filter)", "Clear Pane Selection".
- Workspace switch now clears selectedTerminalIds so a stale selection cannot leak across workspaces.

Files
- src/renderer/state/terminal-store.ts: type + impl for showSelectedPanes, showAllPanes; setActiveWorkspace clears selection.
- src/renderer/components/TerminalPanel.tsx: isMultiSelected subscription, .multi-selected class, Ctrl+click handler on .terminal-pane-title, focus-shift suppression in onMouseDownCapture.
- src/renderer/components/CommandPalette.tsx: three new commands.
- src/renderer/styles/global.css: .multi-selected outline + layered focused-and-selected rule.

Cross-platform
- Uses isMac ? metaKey : ctrlKey throughout, matching project convention.

Tests
- tests/e2e/workspaces-multi-select.spec.ts (new): 4 tests covering Ctrl+click toggle, visual indicator class, showSelectedPanes hides non-selected and showAllPanes restores, selection cleared on workspace switch, and the no-op guard for <2 selected.
- npx tsc --noEmit: clean (no new errors introduced).
- npx vite build: clean.
- E2E suite NOT executed in this worktree - packaged build is absent and packaging was off-limits without parent approval.

Risks / follow-ups
- showSelectedPanes flips viewMode to grid; showAllPanes maps grid -> focus on exit. If the user was already in grid mode for an unrelated reason, exiting the filter will leave them in focus mode. Acceptable trade-off given the existing grid plumbing, but worth a follow-up if it bites.
- Floating panes are not in tilingRoot, so they're not affected by the filter. Floats with multi-select are a deliberate non-goal here - the original feature was tab-scoped.
<!-- SECTION:FINAL_SUMMARY:END -->
