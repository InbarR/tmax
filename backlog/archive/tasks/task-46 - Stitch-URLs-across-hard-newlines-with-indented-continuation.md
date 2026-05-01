---
id: TASK-46
title: Stitch URLs across hard-newlines with indented continuation
status: Done
assignee:
  - '@inbar'
created_date: '2026-04-30 11:05'
updated_date: '2026-05-01 08:16'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a CLI hard-wraps a long URL with an indented continuation line (e.g. gh cli SAML message: line 2 starts with whitespace then continues the URL), tmax's link provider in TerminalPanel.tsx bails on the seam check (line ~419: 'if (/^\s/.test(nextText)) break;') and only marks the first line as clickable. Clicking the link opens the truncated URL. Repro URL from gh: https://github.com/enterprises/microsoft/sso?authorization_request=A42LHL5Y3IDODQAD<continuation>.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 URL link provider stitches forward across a hard-newline seam even when the next line starts with whitespace, as long as the trimmed continuation token is URL-safe and no whitespace appears within it
- [x] #2 Same support for backward stitch (clicking on the indented continuation line still rebuilds the full URL)
- [x] #3 offsetToRowCol returns correct visual column for stitched segments that had their leading whitespace trimmed
- [x] #4 Existing behavior preserved: lines that have whitespace BETWEEN URL-safe tokens (i.e. real text after the URL) still terminate the stitch
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stitched URLs across hard newlines with indented continuations in TerminalPanel.tsx link provider (~line 403-435 forward, 439+ backward). Heuristic requires the continuation row to be a single whitespace-free URL-safe token after trimming leading whitespace, bounded to 8 hops to avoid runaway. Bidirectional: clicking the head row OR any continuation row rebuilds and opens the full URL. e2e regression test added (TASK-46 case in tests/e2e/issue-62-multiline-links.spec.ts) - asserts 3+ rows match and link.text equals the full stitched URL. All 4 tests in the spec pass.
<!-- SECTION:FINAL_SUMMARY:END -->
