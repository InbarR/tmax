---
id: TASK-52
title: Smart unwrap on copy - stitch CLI-rendered hard newlines back into paragraphs
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-01 08:07'
updated_date: '2026-05-01 08:47'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copilot CLI / Claude Code render long paragraphs by emitting hard newlines plus a leading space on continuation rows. Confirmed via Get-Clipboard | Format-Hex from both tmax AND Windows Terminal that the hard newlines and indent are in the source bytes, not a tmax copy bug. tmax can still help: at copy time, optionally stitch lines back together when the next row begins with whitespace (continuation indicator). Same heuristic family as TASK-46 (URL stitch across hard newlines with indented continuation). Apply in TerminalPanel copy paths around term.getSelection() (~line 631, 643, 650, 1163). Should be opt-in or auto-detected so we do not mangle code blocks where leading whitespace is meaningful.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selecting a paragraph that spans CLI-emitted hard newlines + continuation indent copies as a single line into the clipboard
- [x] #2 Code blocks (where indent is significant) are not unwrapped - heuristic skips lines inside fenced code or after a strong indent jump
- [x] #3 Setting toggle if the heuristic is too aggressive
- [x] #4 Hex test confirms no spurious newlines in clipboard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Pure utility smartUnwrapForCopy(text,enabled) joins continuation rows starting with 1-2 leading spaces. Skips fenced code, bullets, headings, 3+ space indents, blank-line resets. Wired into all 4 term.getSelection() copy paths via smartUnwrapRef so live config updates apply without rebuilding terminal. Added Settings checkbox + 13 unit tests (all pass).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New src/renderer/utils/smart-unwrap.ts pure helper smartUnwrapForCopy(text, enabled). Heuristic joins continuation rows that start with EXACTLY 1-2 spaces + non-whitespace; skips fenced code blocks (`), bullets/numbered lists, headings (#/>), 3+ space indents, and resets on blank lines. Wired into all 4 term.getSelection() copy paths in TerminalPanel.tsx via a smartUnwrapRef that mirrors config.terminal.smartUnwrapCopy so live setting changes apply without rebuilding the terminal. Default true; toggle added to Settings > Terminal. 13 unit tests cover the heuristic incl. AC #4 (hex check that no spurious mid-paragraph newlines remain). All tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
