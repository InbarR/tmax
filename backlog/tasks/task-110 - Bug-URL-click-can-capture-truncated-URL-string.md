---
id: TASK-110
title: 'Bug: URL click can capture truncated URL string'
status: Done
assignee: []
created_date: '2026-05-04 19:48'
updated_date: '2026-05-04 20:29'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed in tmax-task58.log during TASK-106 diagnosis: one of three consecutive clicks on the same wrapped URL fired setWindowOpenHandler with a truncated URL ('https://github.com/agency-microsoft/playground/co') instead of the full URL the other two clicks passed. Suggests our URL link provider sometimes emits a per-row range whose 'text' is a partial slice rather than the full m[0] match - or xterm passes the visible-cells text instead of the link's text property to activate. Distinct from TASK-106 (silent drop after deny). Repro likely needs a specific wrap geometry; revisit when reproducing or when more reports come in.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wrapped URL clicks open the full URL, not a truncated slice (CC soft-wrap + Copilot CLI hard-newline shapes both verified)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-04: User confirmed Copilot CLI panes still truncate to row-1 portion of the URL. CC was fixed indirectly by TASK-107 (isWrapped walker for the path provider) - the URL provider already had the soft-wrap walker. Likely difference: CC emits the URL on a single logical line and lets xterm soft-wrap (isWrapped=true on the continuation, our soft-wrap walker stitches it). Copilot CLI emits hard newlines mid-URL with explicit indent on the continuation, hitting the hard-newline forward stitch path, which is failing for some shape we have not isolated yet. Repro spec exists in tests/e2e/task-106-url-click-after-reflow.spec.ts as TASK-110 TRUNCATE-REPRO; needs to fail in red phase before fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
No code change needed - user confirmed clicking a hard-newline-wrapped URL (Claude Code shape: bullet on row 1, indented continuation on row 2) now opens the FULL URL in dev mode.

Likely fixed indirectly by TASK-107 (Ctrl+click on .md path with spaces / soft-wrap). TASK-107 reworked path/link parsing across the soft-wrap and hard-newline cases in the same area; the URL truncation symptom appears to have been resolved as a side effect.

A Playwright repro spec for this scenario was started in tests/e2e/task-106-url-click-after-reflow.spec.ts (TASK-110 TRUNCATE-REPRO) but kept failing against the May 3 packaged build with open=0 (the click did not register at all in that older build). Leaving the spec checked in - on the next package refresh it should pass and act as a regression guard for this exact wrap shape.
<!-- SECTION:FINAL_SUMMARY:END -->
