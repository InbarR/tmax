---
id: TASK-43
title: 'Workspaces polish - color tints, per-workspace colorize, UX cleanup'
status: Done
assignee: []
created_date: '2026-04-30 10:09'
updated_date: '2026-04-30 10:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Round of polish on top of TASK-40 driven by interactive testing in dev mode. Settings: added Tab Mode dropdown (Flat/Workspaces) under Appearance so the mode is discoverable outside the command palette. WorkspaceTabBar: full context menu (workspace color, clear all colors, tab bar position submenu, settings, new terminal submenu, close others, close), rename hint shows Double-click. Inline + on the active workspace chip adds a pane to that workspace; outer + creates a new workspace. Mode toggle is a clear text pill (Switch to tabs / Switch to workspaces) instead of confusing icons. Middle-click closes a workspace. Workspace color renders as the chip's bottom border. TerminalPanel: workspaces tint panes when a workspace color is set; precedence is groupColor > workspaceColor > tabColor > defaultTabColor (workspace beats auto-colorize). terminal-store: setWorkspaceColor, clearAllWorkspaceColors, and per-workspace scoping in colorizeAllTabs and the auto-color-on-create path so each workspace colors from scratch (a new workspace's first pane is Red, not 'color #5'). TabContextMenu: Tab Bar Position and New Terminal moved into expandable submenus (matches Add to Group pattern); rename hint reads 'Double-click / Ctrl+Shift+R'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings has Tab Mode dropdown under Appearance
- [x] #2 Workspace context menu has color, clear all colors, tab bar position submenu, settings, new terminal submenu, close others, close
- [x] #3 Inline + on active workspace chip adds a pane; outer + creates a workspace
- [x] #4 Mode toggle is a clear text pill, not an icon
- [x] #5 Middle-click on a workspace chip closes it (last-workspace guard preserved)
- [x] #6 Workspace color tints panes; group color still wins; workspace beats auto-colorize
- [x] #7 Per-workspace colorize: each workspace's first pane gets the first MS color, regardless of other workspaces' pane counts
- [x] #8 TabContextMenu: Tab Bar Position and New Terminal are submenus; rename row shows Double-click hint
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Polish round on top of TASK-40, validated by interactive testing in dev mode.

Settings:
- Tab Mode dropdown (Flat / Workspaces) under Appearance.

WorkspaceTabBar:
- Full context menu: Workspace Color, Clear All Workspace Colors, Tab Bar Position submenu, Settings, New Terminal submenu, Close Others, Close. Rename row shows Double-click hint.
- Inline + on the ACTIVE workspace chip = add pane to this workspace.
- Outer + (plain) = new workspace.
- Mode toggle is a text pill ('Switch to tabs' / 'Switch to workspaces') instead of confusing icons.
- Middle-click on a workspace chip closes it (last-workspace guard preserved).
- Workspace color renders as the chip's bottom border.

TerminalPanel:
- Workspace color tints panes when set. Precedence: groupColor > workspaceColor > tabColor > defaultTabColor (workspace beats auto-colorize, but explicit group color still wins).

terminal-store:
- New actions: setWorkspaceColor, clearAllWorkspaceColors.
- colorizeAllTabs and the auto-color-on-create path now scope by workspaceId, so each workspace colorizes from scratch (a new workspace's first pane is MS color #1, not 'color #5').

TabContextMenu:
- Tab Bar Position and New Terminal moved into expandable submenus (matches Add to Group pattern).
- Rename row shows 'Double-click / Ctrl+Shift+R'.

Risks / follow-ups:
- No Playwright coverage added in this round (filed as TASK-45).
- Workspace color is the chip's border-bottom only; no explicit visual on inactive chips beyond that 3px stripe.
<!-- SECTION:FINAL_SUMMARY:END -->
