---
id: TASK-39
title: 'VSCode-style keybindings.json: configurable shortcuts via on-disk file'
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 19:51'
updated_date: '2026-04-28 20:03'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax already loads keybindings from the config (config-store.ts), but the surface is buried inside the main app config and isn't self-documenting. Users want a VSCode-style approach: a dedicated keybindings.json on disk, hot-reloaded, where they can override any default action -> key mapping, including disabling defaults (set to "" or null).\n\nLikely shape (mirrors VSCode):\n```\n[\n  { "key": "ctrl+shift+w", "action": "closeTerminal" },\n  { "key": "ctrl+w", "action": "closeTerminal", "when": "false" }  // disable default\n]\n```\n\nFile path: ideally next to the existing config (e.g. `%APPDATA%/tmax/keybindings.json` on Windows). Provide a "Open Keybindings File" command in the command palette and a "Reset to Defaults" action. Also expose a list of valid action names (`createTerminal`, `closeTerminal`, `focusUp`, etc.) so users can discover what's bindable.\n\nWatch the file for changes and reload mid-session - users iterating on bindings shouldn't need to restart tmax.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On first launch, tmax creates a default keybindings.json with the current bindings, including doc-comment header explaining schema
- [x] #2 Edits to keybindings.json reload bindings without an app restart
- [x] #3 Defaults-list (Ctrl+T / Ctrl+Shift+W / Ctrl+Shift+P / etc.) is documented inline as comments in the generated file
- [x] #4 Command palette: 'Keybindings: Open File' opens the file in the system editor; 'Keybindings: Reset to Defaults' replaces with the default file
- [x] #5 Schema is forgiving: malformed entries log a warning and the rest of the bindings still apply
- [x] #6 Cross-platform: ctrl on Win/Linux is cmd on Mac via the same isMac convention currently in useKeybindings.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add keybindings-file.ts main-process module: file path is <userData>/keybindings.json, schema is JSON5-flavored (allow trailing commas, // comments) so the doc header survives.
2. On startup: if file missing, write it with all current defaults plus a doc-comment header showing the schema and listing every bindable action.
3. Read + parse + merge with hard-coded defaults; malformed entries emit a console.warn but don't abort.\n4. Watch the file via fs.watch; on change, re-parse and broadcast new bindings to all renderer windows via existing config-changed IPC.\n5. Migration: existing users'  config.keybindings get folded into keybindings.json on first run after upgrade, then the in-config keybindings field is left untouched (read on next start would no-op since file takes precedence).\n6. Command palette items: "Keybindings: Open File" (shell.openPath) and "Keybindings: Reset to Defaults" (rewrites file from defaults).\n7. Playwright spec covering: defaults file is created on first launch; modifying the file rebinds an action; malformed lines are warned-but-tolerated.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation:
- New main-process module src/main/keybindings-file.ts with KeybindingsFile class. File path is <userData>/keybindings.json. Parser tolerates // line comments (with proper handling of strings) and trailing commas. Malformed entries log a warning and are skipped; the remainder of the file still applies.
- Doc-comment header generated dynamically lists every bindable action so users discover what's available without reading source.\n- fs.watch on the parent directory (not the file itself) catches editor atomic-write swaps. 150ms debounce prevents rapid re-fires from save-event bursts.\n- main.ts setupKeybindingsFile() seeds from the legacy config.keybindings on first launch, then the file is authoritative. Hot-reload pushes new bindings to all renderer windows via KEYBINDINGS_CHANGED IPC.\n- Preload exposes getKeybindings / openKeybindingsFile / resetKeybindings / onKeybindingsChanged.\n- App.tsx subscribes to onKeybindingsChanged and patches store.config.keybindings in-place (NOT via updateConfig - that would round-trip to disk and re-fire the watcher in a loop).\n- CommandPalette: "Keybindings: Open File" + "Keybindings: Reset to Defaults" (with confirm dialog).\n- Tests in tests/e2e/keybindings-file-parser.spec.ts cover: clean parse, comment stripping, comments inside strings preserved, trailing commas, malformed entries skipped, JSON-error fallback, non-array fallback, round-trip, header lists actions.\n\nCross-platform: the bindings file uses the same isMac convention already in useKeybindings.ts so Cmd vs Ctrl handling is unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
tmax now has a VSCode-style keybindings.json on disk for shortcut customization.

Location: <userData>/keybindings.json (e.g. %APPDATA%/tmax/keybindings.json on Windows).

Features:
- Auto-created on first launch with current defaults + a doc-comment header listing every bindable action.
- Edits are hot-reloaded - save the file and bindings rebind without an app restart, with a "Keybindings reloaded" toast.
- // line comments and trailing commas are tolerated (JSON5-flavored without the dependency).
- Malformed entries log a warning and are skipped; one typo never locks the user out of all their shortcuts.
- Command palette: "Keybindings: Open File" and "Keybindings: Reset to Defaults".
- Existing users' config.keybindings are seeded into the new file on first launch after upgrade.
<!-- SECTION:FINAL_SUMMARY:END -->
