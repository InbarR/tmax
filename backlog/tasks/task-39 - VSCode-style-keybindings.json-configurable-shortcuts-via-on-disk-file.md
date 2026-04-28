---
id: TASK-39
title: 'VSCode-style keybindings.json: configurable shortcuts via on-disk file'
status: To Do
assignee: []
created_date: '2026-04-28 19:51'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax already loads keybindings from the config (config-store.ts), but the surface is buried inside the main app config and isn't self-documenting. Users want a VSCode-style approach: a dedicated keybindings.json on disk, hot-reloaded, where they can override any default action -> key mapping, including disabling defaults (set to "" or null).\n\nLikely shape (mirrors VSCode):\n```\n[\n  { "key": "ctrl+shift+w", "action": "closeTerminal" },\n  { "key": "ctrl+w", "action": "closeTerminal", "when": "false" }  // disable default\n]\n```\n\nFile path: ideally next to the existing config (e.g. `%APPDATA%/tmax/keybindings.json` on Windows). Provide a "Open Keybindings File" command in the command palette and a "Reset to Defaults" action. Also expose a list of valid action names (`createTerminal`, `closeTerminal`, `focusUp`, etc.) so users can discover what's bindable.\n\nWatch the file for changes and reload mid-session - users iterating on bindings shouldn't need to restart tmax.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On first launch, tmax creates a default keybindings.json with the current bindings, including doc-comment header explaining schema
- [ ] #2 Edits to keybindings.json reload bindings without an app restart
- [ ] #3 Defaults-list (Ctrl+T / Ctrl+Shift+W / Ctrl+Shift+P / etc.) is documented inline as comments in the generated file
- [ ] #4 Command palette: 'Keybindings: Open File' opens the file in the system editor; 'Keybindings: Reset to Defaults' replaces with the default file
- [ ] #5 Schema is forgiving: malformed entries log a warning and the rest of the bindings still apply
- [ ] #6 Cross-platform: ctrl on Win/Linux is cmd on Mac via the same isMac convention currently in useKeybindings.ts
<!-- AC:END -->
