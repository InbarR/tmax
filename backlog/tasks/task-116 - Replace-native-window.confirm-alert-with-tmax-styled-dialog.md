---
id: TASK-116
title: Replace native window.confirm/alert with tmax-styled dialog
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 20:33'
updated_date: '2026-05-04 20:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Native browser confirm/alert dialogs render as out-of-place white Windows-styled boxes against tmax's dark theme. Built a Promise-based AppDialog component (with the tmax chevron logo in the header) and migrated all 5 callsites. Imperative API (confirmDialog / alertDialog) lets non-React code (terminal-store actions) trigger dialogs the same way React code does, via a queue + listener pattern bridged through <AppDialogHost /> mounted at app root.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All window.confirm and window.alert calls in src/renderer go through confirmDialog / alertDialog
- [x] #2 Dialog matches tmax theme: dark background, accent-colored confirm button, tmax chevron logo in header
- [x] #3 Enter accepts, Escape and backdrop click cancel
- [x] #4 Danger style available for destructive confirms (delete file, reset keybindings)
- [x] #5 Multiple concurrent calls are queued and resolved in order
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New src/renderer/components/AppDialog.tsx exposes confirmDialog / alertDialog Promise APIs and a single AppDialogHost rendered once in App.tsx. Internally a tiny queue + listener bridges imperative calls into the React render. Each dialog has a tmax chevron logo (matches the empty-state hero), the title, the message (multi-line via newline split), and Cancel / Confirm buttons. Confirm autofocuses; Enter accepts; Escape and backdrop click cancel.

Migrated callsites:
- src/renderer/state/terminal-store.ts: pane and workspace restore prompts (TASK-112)
- src/renderer/components/CommandPalette.tsx: "Reset keybindings" confirm (now uses danger style)
- src/renderer/components/FileExplorer.tsx: file/folder delete confirm (danger), rename and delete failure alerts

Styles in global.css under "App Dialog" section. Backdrop fade + dialog pop animations (~140ms). Danger style swaps the confirm button to red. Dialog inherits the existing --bg-secondary / --border-color / --accent palette so it stays themed across light/dark.
<!-- SECTION:FINAL_SUMMARY:END -->
