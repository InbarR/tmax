---
id: TASK-125
title: Copy from Claude Code pastes with trailing-space padding between rows
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 12:52'
updated_date: '2026-05-05 14:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports: copying multi-row text from Claude Code output in tmax and pasting elsewhere produces huge gaps (~30+ spaces) between what was the end of one row and the start of the next, instead of either a clean space-join or a single newline. Suggests a copy path is including row-trailing whitespace padding before the row break.\n\ntmax has three copy paths (Ctrl+C copy event handler, right-click contextmenu, smartUnwrapForCopy on selection). All are supposed to funnel through smartUnwrapForCopy in src/renderer/utils/smart-unwrap.ts, which only stitches continuation rows (1-2 leading-space prefix). It does not currently strip per-row trailing whitespace before joining, so if xterm.getSelection() returns padded rows (or our buffer-snapshot path includes trailing spaces), the padding lands in the clipboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Playwright spec writes Claude-Code-like output (long paragraphs + hard newlines + continuation indent + a partial-width final row) and asserts the clipboard text contains no run of 4+ consecutive spaces inside what was a single visual row
- [x] #2 Spec exercises all three copy paths (Ctrl+C, right-click contextmenu, browser copy event) and identifies which produces the artifact
- [x] #3 Fix lives in smartUnwrapForCopy or the call sites: each row is right-trimmed before joining
- [x] #4 Existing TASK-52 smart-unwrap behavior preserved (continuation rows still merge)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Strips per-row trailing whitespace in smartUnwrapForCopy. Root cause: xterm.getSelection() on multi-row selections returns rows ending with padding spaces before CRLF; smartUnwrapForCopy already trimmed when merging continuation rows but pushed non-merge rows verbatim. Trim regex needed to include CR because text.split on LF leaves CR at end of each line, blocking the previous regex. Fix: trimRowEnd helper strips trailing [space|tab|CR] run outside fenced code blocks at both merge and row-push sites. Filed TASK-124 (add Vitest) alongside - this would be one cheap unit test if we had a unit-test framework.
<!-- SECTION:FINAL_SUMMARY:END -->
