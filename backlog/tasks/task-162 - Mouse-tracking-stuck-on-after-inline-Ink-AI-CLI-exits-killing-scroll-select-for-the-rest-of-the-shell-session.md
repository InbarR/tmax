---
id: TASK-162
title: >-
  Mouse tracking stuck on after inline (Ink) AI CLI exits, killing scroll +
  select for the rest of the shell session
status: Done
assignee:
  - '@inrotem'
created_date: '2026-06-11 15:07'
updated_date: '2026-06-13 13:39'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (2026-06-11): in a pane that had run an AI CLI (Copilot/Claude Code), wheel scroll and drag-select are dead for the whole remaining shell session - not the float/re-tile trigger of TASK-156/158. Root-cause hypothesis: TerminalPanel only force-resets stuck mouse-tracking modes on ALT-SCREEN EXIT (?1049l). Ink-based CLIs (Copilot/Claude) enable mouse tracking (?1000h/?1002h/?1003h/?1006h) WITHOUT entering alt-screen (they render inline), so when they exit or are Ctrl+C'd without sending the matching ?1000l/?1006l, the alt-screen-exit reset never fires and xterm keeps forwarding wheel+drag to the dead child - scrollback scroll and drag-select stop working. Need a reset path that does not depend on alt-screen exit (e.g. on detected return-to-shell / AI process gone, or a mouse-mode reset when the foreground process flips from AI back to a shell).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After an inline AI CLI (Copilot/Claude) is exited or Ctrl+C'd, wheel scroll over scrollback works again in the same pane
- [ ] #2 Drag-select works again in the same pane after the AI CLI exits
- [ ] #3 Fix does not depend on the app having used alt-screen
- [ ] #4 Reproduced + covered by a Playwright test (toggle ?1000h/?1006h without ?1049h, simulate exit, assert mouse modes reset)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found existing mechanism: TerminalPanel poll (lines ~2753-2830) + CommandPalette MOUSE_RESET_SEQUENCE (GH #117). When a STAMPED aiProcessKind disappears from the pane process tree for 2 consecutive 5s scans, it writes [?1000l..?1015l and clears the stamp. So an auto-reset already exists.

Likely gap (user still sees broken scroll/select): the reset only runs if the AI CLI was DETECTED and stamped first; if the process scan gave up (SCAN_MAX_ATTEMPTS) or getPtyChildProcesses failed on Windows, no stamp -> poll never runs -> no reset. Also ~10s latency after death.

Next: bisect with the Command Palette manual reset. If manual reset restores scroll/select, the sequence is fine and the fix is detection robustness (or a non-detection-dependent trigger). If manual reset does NOT restore it, MOUSE_RESET_SEQUENCE is insufficient / xterm keeps forwarding.

Bisect result from user: manual reset restored SELECT but NOT scroll. That rules out mouse-mode as the scroll cause and confirms the pane is stuck on the ALTERNATE-SCREEN buffer (TUI died without ?1049l). Alt buffer has no scrollback -> wheel dead; alt buffer retains the TUI black paint -> black slab (TASK-163, same root cause).

Fix: extracted recovery sequences to src/renderer/utils/terminal-recover.ts. New TERMINAL_RECOVER_SEQUENCE = mouse reset + alt-screen exit (?1049l/?1047l/?47l) + SGR reset ([0m). Wired into (a) the manual Command Palette command (relabeled "Reset Terminal (recover scroll / selection / display)") and (b) the AI-process-gone auto-reset path in TerminalPanel. Repro + regression test: tests/e2e/task-162-stuck-altscreen-recover.spec.ts (stuck alt-screen + mouse on -> recovery -> normal buffer + mouse off; plus a no-op-on-healthy-pane guard). Both pass.

Remaining risk: the AUTO path only fires if the AI CLI was detected/stamped (aiProcessKind). User had to reset manually, so detection likely did not stamp this pane - detection robustness is a separate follow-up. The manual "Reset Terminal" command now fully recovers regardless.

Safety correction: moved the destructive parts (alt-screen exit + SGR reset) to the MANUAL "Reset Terminal" command ONLY. The AI-process-gone AUTO path is back to mouse-reset-only, because that detection can false-fire (getPtyChildProcesses empty on a Windows wmic hiccup x2) and would otherwise tear down a still-LIVE Copilot/Claude pane mid-render (suspected cause of a black input bar the user saw on a fresh Copilot pane in the dev build). Manual recovery still does the full alt-screen+SGR+mouse reset. With this, a freshly-opened AI pane behaves identically to the prior build.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reset Terminal command now exits a stuck alternate screen + resets SGR on top of the mouse reset, restoring wheel scroll. terminal-recover.ts + task-162 e2e test. Auto (AI-gone) path stays mouse-reset-only to avoid corrupting a live pane on false-fire detection. Caveat: Copilot mouse tracking can be sticky (copilot-cli#2332) and may need a hard reset; manual command covers the general case.
<!-- SECTION:FINAL_SUMMARY:END -->
