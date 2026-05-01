---
id: TASK-36
title: 'AI sessions panel: pane-focus highlight is overridden by mouse hover'
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 10:54'
updated_date: '2026-04-28 11:05'
labels:
  - bug
  - ai-sessions
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two related symptoms reported via screenshots 2026-04-28:\n\n1. Clicking a terminal pane sometimes highlights the wrong session in the sidebar.\n2. When the correct session IS highlighted, moving the mouse over the list (without clicking) overrides the highlight to whichever row the cursor passes over.\n\nRoot cause (single bug, two visible symptoms): CopilotPanel.tsx 'selectedIndex' (line 135) is doing double duty - both as the 'reveal-on-pane-focus' target (set at line 403 from the focused-terminal effect) AND as the mouse hover state (overwritten by onMouseEnter at line 776). Hover stomps the pane-driven selection. Symptom #1 is just symptom #2 happening at click-time when the cursor is already over a row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking a terminal pane in the main grid highlights the matching AI session in the sidebar, regardless of where the mouse is at click time
- [x] #2 Hovering over other rows in the sidebar does NOT change the active-session highlight
- [x] #3 Hover provides its own visual affordance distinct from the active-session highlight (or no hover style at all if that's simpler)
- [x] #4 Keyboard arrow navigation in the panel still works as before (j/k or up/down)
- [x] #5 Playwright repro spec lands alongside the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repro test in tests/e2e/ai-sessions-pane-active-vs-hover.spec.ts: inject 2 sessions linked to 2 panes; focus pane A; hover the row of session B in the sidebar; assert the row classed as the "current pane session" remains A even while B is hovered.
2. Fix CopilotPanel.tsx: derive activePaneSessionId from focusedTerminalId via the existing terminals Map. Add CSS class `pane-active` to the row whose session.id === activePaneSessionId.
3. Add .ai-session-item.pane-active CSS rule with a distinct visual style (left border / subtle background) that is NOT shared with :hover or .selected, so hover cannot stomp it.
4. Keep the existing setSelectedIndex on pane-focus effect so keyboard Enter still opens the pane-focused row when nothing else is selected.
5. Run the new spec + the existing session-sidebar-highlight specs to confirm no regression.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced via tests/e2e/ai-sessions-pane-active-vs-hover.spec.ts (failed pre-fix: 0 .pane-active rows; passed post-fix: 1 row, survives hover over other rows).

Fix in CopilotPanel.tsx + global.css:
- New activePaneSessionId memo derived from focusedTerminalId + terminals.
- Row whose session.id matches gets a stable `pane-active` class - distinct from .selected (keyboard cursor) and :hover.
- CSS rule .ai-session-item.pane-active uses inset box-shadow + stronger background, so neither hover nor .selected can overpaint it.
- selectedIndex behaviour for keyboard nav and Enter-to-open is untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
**TASK-36: pane-focus highlight no longer overridden by mouse hover**

The sidebar's `selectedIndex` was doing double duty - both the keyboard-cursor / pane-focus reveal target and rewritten by every `onMouseEnter` for hover. Hover stomped the active-pane indicator, and clicking a pane while hovered over a different row visually highlighted the wrong session.

**Changes**
- `src/renderer/components/CopilotPanel.tsx`: derive `activePaneSessionId` from focused terminal's `aiSessionId`, apply new `pane-active` class to the matching row.
- `src/renderer/styles/global.css`: `.ai-session-item.pane-active` rule with inset left rail + distinct background that hover/selected cannot override.

**Tests**
- New: `tests/e2e/ai-sessions-pane-active-vs-hover.spec.ts` - link two panes to two sessions, focus pane A, hover row B, assert .pane-active still on row A.
- Re-ran: existing `session-sidebar-highlight` specs (5 cases) - still green; the pane-focus reveal/scroll behaviour and TASK-29 auto-link are unaffected.

**Risk**
- Visual: the new highlight is bolder than the old `.selected` style on the active-pane row. If users find it too strong we can soften the rgba.
<!-- SECTION:FINAL_SUMMARY:END -->
