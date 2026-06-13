---
id: TASK-164
title: >-
  Plain left-drag should select text in TUI panes (match Windows Terminal), not
  require Shift
status: Done
assignee:
  - '@inrotem'
created_date: '2026-06-11 16:05'
updated_date: '2026-06-12 16:05'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report (2026-06-11): in a live Copilot/Claude pane, selecting text with the mouse requires holding Shift in tmax, whereas Windows Terminal selects on a plain left-drag without a modifier. tmax currently forwards a plain left-drag to the TUI (mouse tracking on) so the app can use the mouse, with Shift as the local-selection override and a drag-then-right-click snapshot fallback (pendingTuiCopyText). Users of inline AI CLIs almost always want to copy text, so the WT behavior (selection priority on plain drag) is preferable. Trade-off: full-screen alt-screen apps that genuinely use mouse drag (vim visual-select, htop) would lose plain-drag mouse interaction unless gated (e.g. only prioritize selection for inline/normal-buffer TUIs, keep forwarding for alt-screen).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Plain left-drag in an inline AI CLI pane (Copilot/Claude, normal buffer + mouse tracking) produces a visible native selection that can be copied, without holding Shift
- [x] #2 A modifier (or alt-screen detection) still lets full-screen mouse apps receive drag where appropriate
- [x] #3 Covered by an e2e test (mouse tracking on, simulated plain drag, assert term.hasSelection())
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In TerminalPanel handleLeftMouseUp: when a plain left-drag produced NO native xterm selection (because xterm mouse-tracking forwarded it to the app) AND the pane is on the NORMAL buffer (inline AI CLI like copilot/claude, NOT a full-screen alt-screen app), create a real visible selection from the drag rectangle via term.select(col,row,length). Alt-screen apps (vim/htop) keep getting the mouse.
2. Gate on xterm actual state (!hasSelection + normal buffer), not tmax mouseTrackingOn var, so it survives the reattach desync.
3. Keep the buffer snapshot (pendingTuiCopyText) as the right-click copy fallback.
4. e2e test: enable ?1000h mouse tracking, drag across rows via page.mouse, assert hasSelection becomes true; alt-screen drag does NOT auto-select.

Context: copilot-cli#2332 - Copilot leaves mouse tracking sticky (not cleared by ?1000l, needs hard reset); doing the selection locally sidesteps it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Superseded by TASK-158: user confirmed plain-drag selection WORKED in tmax before and breaks after opening another pane - so this is a regression (TASK-158), not a new WT-parity feature. Keep 158 canonical.

BLOCKED - found a deeper issue while implementing. Wrote the drag-select logic (deferred term.select on a plain drag in normal-buffer panes), but an e2e repro proved the pane handler never runs: a fresh capture mousedown listener attached in the test to .xterm-container FIRES (docDown/cDown=1), but TerminalPanel own listeners on containerRef.current do NOT (downCount=0) for the same live element. So after the portal change (TASK-158), TerminalPanel container-bound mouse listeners (handleLeftMouseDown/Up) appear bound to a stale node, not the live xterm. This breaks TUI drag-copy AND the new TASK-164 selection - the handler simply does not fire. Likely entangled with the portal host re-parenting; candidate regression from TASK-158. Next: fix listener attachment (re-bind after host re-parent, or attach to a stable node), then TASK-164 selection works. TASK-164 code is in place but unverifiable until then.

RESOLVED - the "listeners do not fire" was a STALE BUILD artifact, not a real bug. The e2e harness (tests/e2e/fixtures/launch.ts) launches the packaged app from out-e2e/, which predated my edits. After repackaging and pointing e2e at the fresh build (TMAX_E2E_OUT_DIR=out npx playwright test), a diagnostic confirmed TerminalPanel mouse listeners DO bind to the live connected xterm node (srcIsLive=true). The portal change did not break listeners.

TASK-164 verified: tests/e2e/task-164-tui-drag-select.spec.ts passes (2/2) against the fresh build - plain left-drag in a normal-buffer (inline AI CLI) pane with mouse tracking on now produces a visible selection; alt-screen apps (vim/htop) are left alone. Fix = deferred term.select() from the drag rectangle in TerminalPanel handleLeftMouseUp, gated on normal buffer + no native selection.

REAL root cause (found via dev diag log dbg164): after reattach, the copilot pane is on the ALTERNATE screen buffer with mouse tracking on (mup showed buf=alternate, mouseProto=DRAG). My first fix gated drag-select on normal buffer only - which excluded copilot (I wrongly assumed inline AI CLIs use the normal buffer). Real fix: gate on whether the pane is a detected AI CLI (store aiSessionId || aiProcessKind), NOT on buffer type. So copilot/claude select on any buffer; real full-screen apps (vim/htop, no AI session) keep their mouse. User confirmed working in dev. Verifying with updated e2e (normal selects / AI-on-alt selects / non-AI-on-alt does not).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plain left-drag now selects text in AI CLI panes (copilot/claude), matching Windows Terminal, instead of being swallowed by the app mouse reporting.

Root cause: copilot/claude run on the ALTERNATE screen buffer with mouse tracking on, so xterm forwards a left-drag to the app and makes no native selection. (copilot-cli#2332: that mouse tracking is sticky and not reliably clearable, so disabling it is not viable.)

Fix (TerminalPanel handleLeftMouseUp): when a left-drag produced no native selection, create one from the drag rectangle via a deferred term.select(). Gated on whether the pane is a detected AI CLI (store aiSessionId/aiProcessKind), NOT on buffer type - so copilot/claude select on any buffer while real full-screen apps (vim/htop, no AI session) keep their mouse. The deferred apply lands after xterm own mouse-reporting mouseup handler so the selection is not reset.

Verified: confirmed in dev by the user (copilot -> detach -> reattach -> plain drag selects). Regression test tests/e2e/task-164-tui-drag-select.spec.ts (3/3): normal-buffer selects, AI-on-alt selects, non-AI-on-alt does not.

Process note: a stale out-e2e build masked the real cause for a while - see memory reference_e2e_stale_build_outdir.
<!-- SECTION:FINAL_SUMMARY:END -->
