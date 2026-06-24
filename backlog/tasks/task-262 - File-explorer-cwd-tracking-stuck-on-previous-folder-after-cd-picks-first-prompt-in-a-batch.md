---
id: TASK-262
title: >-
  File explorer + cwd tracking stuck on previous folder after cd (picks first
  prompt in a batch)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-24 10:33'
updated_date: '2026-06-24 10:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: in a pane, generate a few prompts (e.g. press Enter a few times) then 'cd' to a new folder. The terminal shows the new prompt (PS C:\Users>), but the pane's tracked cwd - and the File Explorer sidebar, which follows it (FileExplorer.tsx:62-64) - stay on the PREVIOUS folder (C:\projects). Root cause: the cwd-detection in TerminalPanel.tsx (~line 2048-2079) uses data.match()/clean.match(), which returns the FIRST match in the chunk. PTY output is batched by pty-manager, so a single chunk can contain several prompt lines; the regex picks the first (oldest) prompt's directory instead of the last (current) one. Affects the OSC 7 match, the OSC 9;9 match, and the PS/cmd prompt-regex fallback. Reported by user on packaged build (PowerShell, Windows).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a single PTY data chunk contains multiple prompt lines, cwd detection resolves to the LAST (most recent) directory, not the first
- [ ] #2 OSC 7, OSC 9;9, and the PS/cmd prompt-regex fallback all take the last match in the chunk
- [ ] #3 After 'cd' to a new folder, the pane's tracked cwd and the File Explorer sidebar both update to the new folder
- [ ] #4 No regression for single-prompt chunks (normal case still detects correctly)
- [ ] #5 A unit test feeds a multi-prompt batch and asserts the last directory wins
<!-- AC:END -->
