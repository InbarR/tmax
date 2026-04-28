---
id: TASK-38
title: Free Ctrl+W for shell readline; move 'close pane' to Ctrl+Shift+W
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 19:50'
updated_date: '2026-04-28 19:53'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ctrl+W is the universal readline / bash / zsh / Claude-Code-input shortcut for "delete previous word". v1.6.0 added Ctrl+W as "close terminal" in tmax (per the "Ctrl+T / Ctrl+W: New and close terminal" feature note), which intercepts before the shell sees it - users typing Ctrl+W expecting to delete a word get their pane closed instead. Multiple users have complained.

The pane-close binding should be Ctrl+Shift+W (matches Windows Terminal's convention; iTerm2 uses Cmd+W on Mac). Ctrl+W should pass through to the focused shell.\n\nKeep Ctrl+T (new pane) - that one isn't a readline conflict.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pressing Ctrl+W in a focused terminal does NOT close the pane; the byte sequence reaches the shell so readline / Claude / etc. delete the previous word as usual
- [x] #2 Ctrl+Shift+W closes the focused pane
- [x] #3 Pane ⋯ menu shortcut hint for Close updated to Ctrl+Shift+W
- [x] #4 Cross-platform: on Mac the shortcut is Cmd+Shift+W (matches the existing isMac pattern)
- [x] #5 Playwright spec covers: Ctrl+W -> shell receives bytes; Ctrl+Shift+W -> pane closes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Removed Ctrl+W -> closeTerminal from defaults in useKeybindings.ts and config-store.ts.
- Added migration that strips the legacy Ctrl+W -> closeTerminal binding from existing users' saved configs (one-time, non-destructive: users who explicitly added it can re-add via the bindings file).\n- Updated UI surfaces: ShortcutsHelp dialog, status-bar tip, pane title-bar X tooltip, pane menu Close item shortcut hint.\n- Repurposed tests/e2e/ctrl-t-ctrl-w-hotkeys.spec.ts to assert BOTH halves: Ctrl+W is no-op for the pane (passes through to shell), Ctrl+Shift+W closes the focused terminal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ctrl+W no longer closes the focused tmax pane.

Why: Ctrl+W is the universal readline / bash / zsh / Claude Code shortcut for "delete previous word". v1.6.0 mapped it to closeTerminal; users typing Ctrl+W expecting a word delete were silently losing panes.

What changed:
- useKeybindings.ts: dropped the Ctrl+W -> closeTerminal default mapping.
- config-store.ts: defaults no longer include Ctrl+W; new migration removes the legacy entry from existing users' saved configs.\n- All UI hints now show Ctrl+Shift+W: ShortcutsHelp, status-bar tips, pane title-bar X tooltip, pane menu Close item shortcut.\n- ctrl-t-ctrl-w-hotkeys.spec.ts now asserts Ctrl+W is a no-op AND Ctrl+Shift+W closes the pane.\n\nCross-platform: the existing isMac convention in keybinding handling means Cmd+Shift+W on macOS as expected.
<!-- SECTION:FINAL_SUMMARY:END -->
