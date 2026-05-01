---
id: TASK-28
title: Add robust e2e regression test for bracketed-paste wrapping
status: Done
assignee:
  - '@Inbar'
created_date: '2026-04-26 19:33'
updated_date: '2026-04-28 08:37'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax now wraps the clipboard payload in CSI 200~ / 201~ when the focused pane has bracketed paste enabled (?2004h, used by PSReadLine, Claude Code, Copilot CLI, bash readline). Issue-72/73 specs were updated to accept both raw and wrapped sizes, but a dedicated spec that asserts the wrap actually happens (vs only that paste fired exactly once) would be stronger. Tried Ctrl+V via Playwright keyboard.press and it didn't fire in offscreen e2e mode - need to either drive the paste via xterm's helper-textarea direct dispatchEvent, or extract the wrap logic to a pure function that can be unit-tested without launching Electron.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Spec asserts that with bracketed paste enabled, paste payload is wrapped in CSI 200~ / 201~
- [x] #2 Spec asserts that with bracketed paste disabled, payload is sent raw
- [x] #3 Spec passes deterministically in the full e2e suite
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract prepareClipboardPaste pure function
2. Update 4 paste paths (TerminalPanel ctrl+v + right-click; DetachedApp ctrl+v + right-click)
3. Add unit tests in paste-wrap.spec.ts that pin down wrap + CRLF normalize
4. User verifies via tmax-swap rebuild
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted prepareClipboardPaste(text, bracketedPaste) into src/renderer/utils/paste.ts.

Found and fixed 3 additional paste paths missed by 16631ee:
- TerminalPanel right-click contextmenu paste
- DetachedApp right-click contextmenu paste
- DetachedApp Ctrl+V (had wrap but no CRLF normalize)

All 4 paste paths (TerminalPanel ctrl+v + right-click; DetachedApp ctrl+v + right-click) now route through the shared helper.

Added 8 unit tests in tests/e2e/paste-wrap.spec.ts that pin down: wrap when bracketed, raw when not, CRLF -> LF, lone CR -> LF, mixed CRLF + CR, empty preserved, no-newline preserved, 60-line release-notes-sized payload round-trips intact. All pass in 1.4s without launching Electron.

User verified in npm start (HMR): right-click paste of 60-line content into Claude Code now shows [Pasted text #1 +59 lines] - the bracketed-paste indicator confirms the full payload arrived as a single paste event.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Multi-line paste now reliably reaches readline-style shells (Claude Code, Copilot CLI, PSReadLine, bash readline) intact across all four paste entry points.

What changed:
- New pure function src/renderer/utils/paste.ts -> prepareClipboardPaste(text, bracketedPaste). Normalizes CRLF and lone CR to LF; wraps in CSI 200~ / 201~ when bracketed paste is on.
- TerminalPanel.tsx: Ctrl+V handler and right-click contextmenu handler now both call prepareClipboardPaste.
- DetachedApp.tsx: Ctrl+V helper (pasteToPty) and right-click contextmenu handler now both call prepareClipboardPaste.

Why:
- Commit 16631ee fixed Ctrl+V in TerminalPanel only. Right-click paste in both windows, plus Ctrl+V in detached windows (which lacked CRLF normalization), still dropped multi-line content. Symptom: pasting release notes into Claude Code only delivered the last line.

Tests:
- tests/e2e/paste-wrap.spec.ts: 8 unit tests covering wrap/no-wrap, CRLF/CR/mixed normalization, empty input, no-newline payload, and 60-line large payload. Pure function, no Electron launch, runs in 1.4s.

User impact:
- Pasting any multi-line content (release notes, code blocks, command sequences) into a tmax pane that has a bracketed-paste-aware shell now works - the full payload is delivered as a single paste event.
<!-- SECTION:FINAL_SUMMARY:END -->
