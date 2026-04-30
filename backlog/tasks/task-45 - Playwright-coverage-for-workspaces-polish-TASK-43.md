---
id: TASK-45
title: Playwright coverage for workspaces polish (TASK-43)
status: To Do
assignee: []
created_date: '2026-04-30 10:09'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-43 shipped without e2e tests, against the 'reproduce/repro-with-pw, ship test alongside fix' rule. Add coverage for: workspace color tints panes (precedence: group > workspace > tab > default); per-workspace colorize starts from MS color #1 in each ws; inline + on active chip adds pane to that ws (not a new ws); outer + still creates a workspace; mode toggle text pill swaps the bar; middle-click closes a workspace and respects last-workspace guard; Tab Mode dropdown in Settings flips the bar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Spec asserts per-workspace colorize: first pane in a new workspace gets MS color #1 even when ws#1 already has 4 panes
- [ ] #2 Spec asserts workspace color overrides auto-colored pane tint when colorize is on
- [ ] #3 Spec asserts inline + on active chip creates a pane in same workspace; pane count in other workspaces unchanged
- [ ] #4 Spec asserts middle-click closes a workspace; last workspace cannot be closed by middle-click
<!-- AC:END -->
