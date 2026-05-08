---
id: TASK-137
title: 'Bug: TASK-132 backward stitch on .md hard-newline wrap loses seam space'
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-08 08:04'
updated_date: '2026-05-08 14:22'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-132. Forward-stitch (click on top row) reconstructs paths with embedded literal spaces (OneDrive - Microsoft\...) correctly because it restores one seam space when the post-wrap row had leading whitespace. Backward-stitch (click on bottom row) does NOT do the same restoration when prepending the prev row, so the stitched path becomes 'OneDrive -Microsoft\...' (one less space) and fileRead silently 404s. User confirmed: top click works, bottom click does nothing.\n\nFix: trim leading whitespace from the current logical when prepending a prev row, restore exactly one seam space, and bump segs[0].leadingWS so offsetToRowCol still places clicks on the correct visual column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Click on the post-wrap (bottom) row of a hard-wrapped .md path with embedded space stitches the same logical path the top-row click produces
- [x] #2 Click on a no-embedded-space wrapped path (most clipboard paths) is unaffected by the change
- [x] #3 Visual click column resolution (offsetToRowCol) still lands on the correct cell after the leading-WS trim
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In TerminalPanel.tsx .md provider's backward-stitch loop, before unshifting prevRow seg: detect leading whitespace on logical (matching segs[0]'s row content). 2. If wsLen > 0: trim those chars from logical, restore exactly one seam space; bump segs[0].leadingWS += wsLen so offsetToRowCol still maps to correct visual col; shift segs[1+].logicalStart by -wsLen (trim) then by +(prevText.length + 1) (prepend with seam). 3. If wsLen == 0: keep current behavior (just prepend prevText). 4. Mirror the forward-stitch comment about why we restore exactly one space when there were multiple. 5. Typecheck via npx tsc --noEmit. 6. No new e2e tests (infra broken; coverage gap acknowledged).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mirrored the forward-stitch seam-space logic into the backward-stitch loop in TerminalPanel.tsx's .md link provider. When the queried row's logical content begins with leading whitespace (the wrap-eaten seam space Ink kept on the post-wrap row), trim it and prepend exactly one seam space along with prevText. Bumps segs[0].leadingWS by the trimmed count so offsetToRowCol still maps clicks to the correct visual column. Verified by tracing the user's OneDrive - Microsoft path scenario; stitched logical now equals the single-space on-disk path. Shipped in 467a002.
<!-- SECTION:FINAL_SUMMARY:END -->
