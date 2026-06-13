---
id: TASK-161
title: >-
  Multi-line paste into non-TUI shells (PowerShell/cmd) arrives with lines
  reversed
status: Done
assignee:
  - '@inrotem'
created_date: '2026-06-11 14:55'
updated_date: '2026-06-11 14:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pasting multi-line clipboard text into a plain shell pane (Windows PowerShell 5.1, cmd) renders the lines in reverse order. Pasting the same clipboard into an AI TUI pane (Claude Code / Copilot) is correct. Root cause: tmax normalizes all paste newlines to bare LF; legacy PSReadLine reverses multi-line input delivered as bare LF. TUIs are unaffected because they advertise bracketed paste (the payload is wrapped in CSI 200~/201~). Verified at the pty level: LF reverses, CR delivers lines in order (what Windows Terminal sends), and WinPS 5.1 ignores the 200~ wrapper entirely so bracketed wrapping does not help there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Multi-line paste into a non-bracketed shell (no ?2004h advertised) delivers lines in original top-to-bottom order, not reversed
- [x] #2 Bracketed-paste path (AI TUIs / modern shells) is unchanged: payload still wrapped in CSI 200~/201~ with LF-normalized newlines
- [x] #3 Single-line paste is unchanged on both paths; no spurious trailing newline added
- [x] #4 Regression test in tests/e2e/paste-wrap.spec.ts pins the non-bracketed line-ending behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. (done) Reproduce at pty level: spawn powershell.exe + pwsh.exe via node-pty, write multi-line LF vs CR vs bracketed. Confirmed LF reverses; CR keeps order; WinPS5.1 ignores 200~ wrapper.
2. Fix src/renderer/utils/paste.ts prepareClipboardPaste: keep bracketed branch as-is (LF inside 200~/201~). For the non-bracketed branch, normalize all newlines to a single CR (collapse CRLF/CR/LF -> ) so lines are accepted in order like a real terminal paste, instead of bare LF which PSReadLine reverses.
3. Update existing assertions in tests/e2e/paste-wrap.spec.ts that expected non-bracketed -> LF, and add a regression test asserting non-bracketed multi-line -> CR-separated (no 
, no reversal contract).
4. Run the paste-wrap spec.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced at pty level via node-pty against real powershell.exe (WinPS 5.1) and pwsh.exe (PS7): bare-LF multi-line input renders reversed; CR delivers lines in order; WinPS 5.1 ignores the CSI 200~ wrapper so bracketing does not help there.

Fix: prepareClipboardPaste now branches - bracketed path unchanged (LF inside 200~/201~), non-bracketed path converts CRLF/CR/LF to a single CR. Single-line and empty input untouched.

Updated paste-wrap.spec.ts (non-bracketed contract now CR) and added a top-to-bottom order regression test. All 9 specs pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix multi-line paste arriving upside-down in plain PowerShell/cmd panes.

What was wrong: tmax normalized every paste to bare LF. Legacy PSReadLine (Windows PowerShell 5.1) renders multi-line bare-LF input in reversed order. AI TUI panes were unaffected because they advertise bracketed paste, so the payload is wrapped in CSI 200~/201~ and the LFs are treated as data.

Fix (src/renderer/utils/paste.ts): split prepareClipboardPaste into two paths. Bracketed shells keep the existing behavior (LF-normalized payload wrapped in 200~/201~). Non-bracketed shells now receive a single CR per line (CRLF/CR/LF all collapsed to ), which is what a real terminal sends on paste - lines arrive in original order, one Enter each, no double-submit.

User impact: pasting multi-line text into a normal shell pane keeps top-to-bottom order. Note this cannot make a non-bracketed shell hold the paste as one editable buffer (only bracketed paste can); complete-per-line commands execute line-by-line, same as Windows Terminal.

Tests: tests/e2e/paste-wrap.spec.ts updated to the CR contract plus a new line-order regression test. All 9 specs pass.
<!-- SECTION:FINAL_SUMMARY:END -->
