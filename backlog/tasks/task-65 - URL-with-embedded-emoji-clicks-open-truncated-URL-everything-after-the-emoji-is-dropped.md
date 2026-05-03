---
id: TASK-65
title: >-
  URL with embedded emoji clicks open truncated URL - everything after the emoji
  is dropped
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-03 06:48'
updated_date: '2026-05-03 06:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reported: clicking https://github.com/gim-home/m/compare/main...inrotem_microsoftⓂ️fix/settings-width-cap?expand=1 in a tmax pane opens https://github.com/gim-home/m/compare/main...inrotem_microsoft%E2%93%82%EF%B8%8F in the browser. Decoded: the URL ends at Ⓜ️ (U+24C2 + variation selector U+FE0F). Everything after the emoji (/fix/settings-width-cap?expand=1) is dropped. Suspected cause: URL_BODY in TerminalPanel.tsx:417 (the hard-newline stitch seam check) is strict ASCII only (/^[A-Za-z0-9%-._~!$&'()*+,;=:@/?#[]|]+$/). When the URL wraps across two rows AND xterm marks the second row as a hard newline rather than a soft wrap, our stitcher checks URL_BODY at the boundary character. The variation selector U+FE0F (and the emoji codepoint U+24C2) are not in URL_BODY's allowed set, so the seam check fails and stitching breaks - the URL ends at the emoji. The user-reported URL is exactly this shape. Need to repro to confirm: is it the soft-wrap path that fails, or the hard-newline stitch? Either way URL_BODY likely needs to accept Unicode chars (or use a different boundary heuristic). Related history: TASK-46 / TASK-47 stitch URLs across wraps; TASK-58 disabled OscLinkProvider so our custom provider is the single source of truth. This is a follow-up edge case for emoji-bearing URLs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking a URL containing an emoji (e.g. Ⓜ️ in a GitHub branch name) opens the FULL URL including everything after the emoji
- [x] #2 URL_BODY heuristic accepts emoji and variation selectors at hard-newline stitch seams
- [x] #3 Soft-wrapped URLs containing emoji also continue to work (no regression)
- [x] #4 Playwright spec: write a wrapping URL with embedded emoji to a terminal, simulate click on it, assert full URL is passed to window.open
- [x] #5 No regression in the existing URL stitching specs (multi-row, hard-newline, OSC 8)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Widened URL_BODY regex in src/renderer/components/TerminalPanel.tsx:378 to accept Unicode property classes (Letter / Number / Mark / Symbol) using the /u flag. Added regression spec tests/e2e/task-65-url-emoji-truncation.spec.ts covering both the emoji case (Ⓜ️ branch name from the user's report) and a plain-ASCII control case. Note: this fix targets the hard-newline-stitch path. If the bug also repros on a single-line URL with no wrapping, that would point to a different cause (the urlRegex itself doesn't exclude emoji codepoints, so single-line should already work).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed URL clicks truncating at an embedded emoji. URL_BODY (the seam-check regex used to decide whether two adjacent buffer rows should be stitched into one URL across a hard newline) was strict ASCII only, so when the user's URL with Ⓜ️ in a GitHub branch name wrapped at the emoji boundary, the variation selector U+FE0F failed the seam check and stitching aborted - the URL ended at the emoji and everything after was dropped. Widened URL_BODY to also accept Unicode letters / numbers / marks / symbols via /u-flag property classes. The single-token guard on the continuation row keeps over-stitching risk minimal. Added Playwright regression spec covering an emoji-bearing URL plus a plain-ASCII control URL.
<!-- SECTION:FINAL_SUMMARY:END -->
