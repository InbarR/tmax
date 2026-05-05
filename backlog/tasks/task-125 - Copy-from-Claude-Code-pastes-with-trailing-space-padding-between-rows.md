---
id: TASK-125
title: Copy from Claude Code pastes with trailing-space padding between rows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-05-05 12:52'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports: copying multi-row text from Claude Code output in tmax and pasting elsewhere produces huge gaps (~30+ spaces) between what was the end of one row and the start of the next, instead of either a clean space-join or a single newline. Suggests a copy path is including row-trailing whitespace padding before the row break.\n\ntmax has three copy paths (Ctrl+C copy event handler, right-click contextmenu, smartUnwrapForCopy on selection). All are supposed to funnel through smartUnwrapForCopy in src/renderer/utils/smart-unwrap.ts, which only stitches continuation rows (1-2 leading-space prefix). It does not currently strip per-row trailing whitespace before joining, so if xterm.getSelection() returns padded rows (or our buffer-snapshot path includes trailing spaces), the padding lands in the clipboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Playwright spec writes Claude-Code-like output (long paragraphs + hard newlines + continuation indent + a partial-width final row) and asserts the clipboard text contains no run of 4+ consecutive spaces inside what was a single visual row
- [ ] #2 Spec exercises all three copy paths (Ctrl+C, right-click contextmenu, browser copy event) and identifies which produces the artifact
- [ ] #3 Fix lives in smartUnwrapForCopy or the call sites: each row is right-trimmed before joining
- [ ] #4 Existing TASK-52 smart-unwrap behavior preserved (continuation rows still merge)
<!-- AC:END -->
