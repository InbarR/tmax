---
id: TASK-45
title: Playwright coverage for workspaces polish (TASK-43)
status: Done
assignee: []
created_date: '2026-04-30 10:09'
updated_date: '2026-05-01 13:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-43 shipped without e2e tests, against the 'reproduce/repro-with-pw, ship test alongside fix' rule. Add coverage for: workspace color tints panes (precedence: group > workspace > tab > default); per-workspace colorize starts from MS color #1 in each ws; inline + on active chip adds pane to that ws (not a new ws); outer + still creates a workspace; mode toggle text pill swaps the bar; middle-click closes a workspace and respects last-workspace guard; Tab Mode dropdown in Settings flips the bar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Spec asserts per-workspace colorize: first pane in a new workspace gets MS color #1 even when ws#1 already has 4 panes
- [x] #2 Spec asserts workspace color overrides auto-colored pane tint when colorize is on
- [x] #3 Spec asserts inline + on active chip creates a pane in same workspace; pane count in other workspaces unchanged
- [x] #4 Spec asserts middle-click closes a workspace; last workspace cannot be closed by middle-click
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Added tests/e2e/workspaces-polish.spec.ts with 4 tests covering each of TASK-43's polish behaviours: per-workspace colorize starting from MS color #1 (the bug where ws#2's first pane was Purple because ws#1 had 4 panes); workspace color overriding auto-colored pane tint via the bgTint precedence in TerminalPanel; inline + on the active chip adding a pane to that workspace (vs outer + which would create a new workspace); and middle-click closing a workspace with the last-workspace guard preserved. Helper forceColorizeOn was needed because colorizeAllTabs is a toggle and autoColorTabs may be persisted as true from prior runs - we directly setState autoColorTabs=false then call the action so the assignment branch always runs. Tint assertion compares parsed RGB triple instead of literal hex because the browser normalizes inline background to rgba().
<!-- SECTION:PLAN:END -->
