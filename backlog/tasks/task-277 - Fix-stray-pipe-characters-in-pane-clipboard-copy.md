---
id: TASK-277
title: Fix stray pipe characters in pane clipboard copy
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-07-25 09:22'
updated_date: '2026-07-25 09:36'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When selecting and copying multi-line output from a tmax pane, extra | (pipe) characters appear in the copied text, aligned to the pane's right margin/wrap column. Pasting into other apps (e.g., Teams) produces broken text. GitHub issue #143.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Copying multi-line pane output no longer inserts stray | characters
- [x] #2 Pasted text in external apps matches the actual terminal content
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add TUI border stripping to smartUnwrapForCopy in smart-unwrap.ts
2. Detect bordered content: >50% of content lines have box-drawing verticals at both edges
3. Strip leading/trailing box-drawing vertical chars and entirely-border lines
4. Also handle ASCII pipe with conservative heuristic (no mid-content pipes)
5. Add tests for the new behavior
6. Verify existing tests still pass
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added TUI box-drawing border stripping to smartUnwrapForCopy (smart-unwrap.ts). When >50%% of content lines have box-drawing vertical characters at an edge, those borders are stripped before the continuation-join pass. Also strips entirely-box-drawing lines (top/bottom borders) and handles ASCII pipe borders conservatively (only when no mid-content pipes, to avoid breaking markdown tables). Added 8 tests covering bordered content, partial borders, markdown table preservation, and border+continuation interaction. All 177 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
