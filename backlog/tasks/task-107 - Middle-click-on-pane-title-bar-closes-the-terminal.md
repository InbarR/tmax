---
id: TASK-107
title: Middle-click on pane title bar closes the terminal
status: Done
assignee:
  - '@Tomer Solomon'
created_date: '2026-05-04 16:03'
updated_date: '2026-05-04 16:17'
labels: []
dependencies: []
references:
  - src/renderer/components/TerminalPanel.tsx
  - src/renderer/components/TabBar.tsx
  - src/renderer/components/FloatingPanel.tsx
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mirror the existing tab middle-click-to-close UX onto the per-pane title bar so users can quickly close a tiled or floating terminal pane by middle-clicking its title bar. Today only the small X icon in the status-dot container or the right-click menu can close a pane via mouse on the title bar. Tabs in TabBar.tsx already support middle-click anywhere on the tab to close (lines 94-102); the per-pane title bar in TerminalPanel.tsx (around line 2000) does not. The per-pane title bar is shared between tiled panes and floating panels so a single change covers both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Middle-clicking on the title bar of a tiled terminal pane closes that terminal
- [x] #2 Middle-clicking on the title bar of a floating panel closes that terminal and removes it from the floating-panels list
- [x] #3 Middle-clicking on the status-dot/X area or on a button inside the title bar does not trigger the new close path
- [x] #4 Middle-clicking on the rename input while a pane is being renamed does not close the terminal
- [x] #5 Existing left-button drag of a floating panel via its title bar continues to work unchanged
- [x] #6 Existing tab middle-click close in TabBar continues to work unchanged
- [x] #7 A new Playwright spec under tests/e2e/ covers the cases above and passes via npm run test:e2e
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read TerminalPanel.tsx around line 2000 to confirm exact insertion point.
2. Add an .button === 1 branch at the top of the existing title-bar onMouseDown that: (a) bails if target is inside button/input/.status-dot-container, (b) calls preventDefault + stopPropagation, (c) calls useTerminalStore.getState().closeTerminal(terminalId), (d) returns early.
3. Add tests/e2e/middle-click-titlebar-close.spec.ts modeled on tests/e2e/float-shortcut.spec.ts, covering: tiled close, floating close, status-dot no-op, rename input no-op.
4. Run npm run test:e2e -- middle-click-titlebar-close.
5. Run npm start and manually verify on Windows.
6. Commit with Co-authored-by trailer; open PR.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a middle-click-to-close handler on the per-pane title bar (.terminal-pane-title) in TerminalPanel.tsx. Mirrors the existing tab middle-click-close UX from TabBar so the same gesture works uniformly on tiled panes and floating panels (both render the same title-bar element).

Changes:
- src/renderer/components/TerminalPanel.tsx: prepended an e.button === 1 branch to the existing title-bar onMouseDown. Bails when the target is inside a button, input, or .status-dot-container so the rename input, X icon, and any nested buttons keep their existing semantics. preventDefault suppresses Windows' middle-button auto-scroll cursor; closeTerminal(terminalId) handles the actual close.
- tests/e2e/middle-click-titlebar-close.spec.ts: new Playwright spec covering tiled close, floating close, status-dot/X no-op, and rename-input no-op.

Tests:
- npm run test:e2e -- middle-click-titlebar-close → 4/4 passing.

Risks/notes:
- xterm Linux middle-click paste is unaffected (handler scoped to the title bar, not the xterm canvas).
- The pane root's onMouseDownCapture still calls handleFocus() before our handler runs; harmless because the doomed pane is closed a tick later and the store re-focuses a survivor.
- Multi-select close-all is intentionally not part of this change (matches tab behavior). Could be a follow-up.
<!-- SECTION:FINAL_SUMMARY:END -->
