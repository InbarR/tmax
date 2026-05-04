---
id: TASK-95
title: 'Bug: URL stitching across hard newlines fails inside markdown tables'
status: Done
assignee:
  - '@inbarr'
created_date: '2026-05-04 06:46'
updated_date: '2026-05-04 06:46'
labels:
  - bug
  - regression
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (via email): clicking a URL that wraps onto a second row inside a markdown-style table opens the URL truncated at the wrap point. Repro: text rendered like:\n\n| Apr 20 | #60129404 (\nhttps://microsoft.visualstudio.com/OS/_workitems/edit/6012940\n4) |\n\nClicking the link tries to open .../6012940 (missing the trailing 4). Cause: the hard-newline forward-stitch heuristic in TerminalPanel.tsx URL provider requires the continuation row to be a single non-whitespace token (regex /^(\s*)(\S+)\s*$/). Markdown tables put | borders and column padding around the cell content, so the row '|         | 4) |' fails the single-token check and the URL doesn't get stitched.\n\nFix: relax the heuristic to allow | and box-drawing chars as leading/trailing 'noise' while still requiring the meaningful payload to be a single non-whitespace, non-pipe token. Markdown table wrap → stitch. Indented prose continuation → still rejected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 URL split across two rows inside a markdown table opens the full URL on click
- [x] #2 URL split across rows in a non-table context (gh CLI indented continuation) still works
- [x] #3 Indented prose paragraph following a URL (non-URL words on next line) still does NOT get stitched as URL continuation
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
URL provider's hard-newline forward-stitch heuristic now allows leading/trailing | and box-drawing chars on the continuation row. The middle still must be a single non-whitespace, non-pipe token, so prose continuations are rejected as before. Markdown-rendered tables that wrap a long URL onto the next row now stitch correctly.
<!-- SECTION:FINAL_SUMMARY:END -->
