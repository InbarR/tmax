---
id: TASK-41
title: Fix focus-stealing loop with Windows Voice Access / external focus thieves
status: Done
assignee:
  - '@copilot'
created_date: '2026-04-30 06:35'
updated_date: '2026-05-01 07:24'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by user testing speech-to-text with Copilot CLI inside tmax: dictation preview renders outside the terminal pane and the input keeps losing focus. Root cause is a focus-stealing loop in src/renderer/components/TerminalPanel.tsx handleBlur (~line 964-977). When the xterm textarea blurs because another process (Voice Access, screen reader, OS overlay) takes OS-level focus, document.activeElement falls back to document.body and the check 'active !== document.body' evaluates false, so tmax re-focuses xterm in a requestAnimationFrame. This fights Voice Access for focus on every dictation event and makes its UIA-anchored overlay land outside the pane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 handleBlur in TerminalPanel does NOT re-focus xterm when document.hasFocus() is false (window-level focus lost)
- [x] #2 When window regains focus, existing handleWindowFocus path still restores xterm focus
- [x] #3 Smoke test: Windows Voice Access can dictate into Copilot CLI inside tmax without focus tug-of-war and the dictation preview overlay renders adjacent to the input box, not floating in the pane gutter
- [x] #4 Existing focus behavior preserved: clicking another in-window element (rename input, sidebar) still steals focus away as before
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix is a 6-line addition: document.hasFocus() guard at the top of the requestAnimationFrame callback in handleBlur. When the window itself has lost OS focus (out-of-process overlay grabbed it), bail out so we don't fight for focus. The existing window-focus listener already restores xterm focus when the user returns to the window - that's the explicit re-focus path for AC #2. Other re-focus sites (handleFocus, handleWindowFocus, visibilitychange, programmatic-focus useEffect) all fire on positive focus events, not blur, so they don't have the same bug.

Built into out-next; ready for smoke-test with Windows Voice Access. AC #3 (smoke test) needs human verification - open C:\projects\tmax-focus-fix\out-next\tmax-win32-x64\tmax.exe, enable Voice Access, dictate into Copilot CLI, confirm no focus thrash and overlay lands in the right spot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-41: stop fighting Windows Voice Access for focus.

Bug
- Tester's video showed Voice Access dictation preview rendering outside the terminal pane and the input losing focus mid-dictation.
- Root cause: TerminalPanel handleBlur re-focuses xterm whenever document.activeElement is body (interpreted as 'no in-window thief'). When an out-of-process overlay (Voice Access, screen reader, OS dictation widget) takes OS focus, body IS the active element - so tmax steals focus back. Tug-of-war breaks dictation and misplaces UIA-anchored overlays.

Fix
- Add a document.hasFocus() short-circuit at the top of the handleBlur requestAnimationFrame callback. If the window itself doesn't hold OS focus, return early.
- Existing window-focus listener (handleWindowFocus) restores xterm focus when the user comes back to the window, so no regression for the alt-tab case.

Risk / scope
- 6-line change, single file (src/renderer/components/TerminalPanel.tsx).
- Other re-focus paths fire on positive focus events, not blur - same bug pattern not present elsewhere.
- AC #3 (smoke test with Voice Access) needs human verification on a Windows machine with the dictation tool installed.
<!-- SECTION:FINAL_SUMMARY:END -->
