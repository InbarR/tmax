---
id: TASK-29
title: AI Sessions sidebar highlights wrong session for the focused AI pane
status: Done
assignee: []
created_date: '2026-04-28 08:43'
updated_date: '2026-04-28 09:55'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user reported that the session highlighted in the AI Sessions sidebar does not match the AI session running in the focused pane. Both are AI sessions (so it is not a non-AI-pane stale highlight) - the focused pane is showing a Claude Code conversation about one topic, while the sidebar selected item is a different session.

The auto-highlight logic in CopilotPanel.tsx:336-361 is edge-triggered on focusedTerminalId change and reads terminal.aiSessionId from the store, then highlights the matching session in the list. So the highlight is faithfully following terminal.aiSessionId - meaning the wrong sessionId is attached to the focused terminal.

Likely root cause: two AI sessions ran in the same cwd at different times, and the cwd-based auto-link in updateTerminalTitleFromSession (terminal-store.ts:2380) bound the focused terminal to the older session.id. The recent gating fixes (9d8649d, cb25622, afb93b4) prevent NEW links from happening on stale sessions, but do not unbind a terminal whose existing aiSessionId is now wrong.

Need: reproduction steps from the reporter, then a fix that detects when the actual session running in a pane diverges from terminal.aiSessionId and re-attaches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reproduce the mismatch deterministically
- [x] #2 Sidebar highlight matches the AI session actually running in the focused pane after the trigger sequence
- [x] #3 Auto-link does not bind a terminal to a session that has been superseded by a newer AI process in the same pane/cwd
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write Playwright e2e regression: two panes; first pane gets session A bound; cd second pane to subdir, simulate a new session B in second pane's cwd while it is focused; assert second pane's aiSessionId becomes B.\n2. Loosen the auto-link skip in terminal-store.ts:2381 to: if (t.aiSessionId === session.id) continue; AND only consider override when t === focusedTerminalId.\n3. Run new test + sibling AI-session tests to make sure no regressions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced locally:
- Two panes in tmax. Left/middle pane: Claude Code session for tmax (cwd C:\projects	max). Right pane: Claude Code session for ClawPilot (cwd C:\projectsawpilot - dir was renamed at some point).
- Click the right pane to focus it.
- AI Sessions sidebar highlights "tmax" (pinned), not the ClawPilot session.

Root cause confirmed: right terminal.aiSessionId is bound to the tmax session.id. The auto-link in updateTerminalTitleFromSession (terminal-store.ts:2380) only assigns a session to a terminal whose aiSessionId is unset (line 2381: `if (t.aiSessionId) continue;`). Once a terminal has any aiSessionId, even one that no longer matches the AI process actually running there, the link is sticky - cd-ing into a subdir, renaming the dir, or running a fresh claude/ghcp in the same pane never causes a re-link.

Proposed fix: when a new AI session arrives whose cwd matches the FOCUSED terminal, allow re-binding the focused terminal even if its aiSessionId was already set to a different (stale) session. Limit the override to the focused terminal so we never silently steal a link from a background pane.

Needs care: must not break the case where two panes share a cwd and both legitimately host distinct sessions.

Reproduced via two-test spec at tests/e2e/session-sidebar-highlight.spec.ts:
- Test 1 (AC #3 supersession): pane with stale aiSessionId rebinds to fresh session in same cwd when focused.
- Test 2 (safety net): non-focused pane keeps its existing binding.

With the original code, Test 1 failed (still bound to original session A) and Test 2 passed. After the fix, both pass in 23s. Sanity-checked 10 AI-session-adjacent tests (smoke, jump-to-prompt, pane-menu-show-prompts, pin-sessions-persist, issue-69-group-by-repo) - all green.

Discovered a SECOND root cause via Playwright reproduction:

When groupByRepo is on (default) and #69's auto-collapse fires on initial mount, the focused pane's session is hidden behind {!isCollapsed && ...} in the render. setSelectedIndex(idx) still picks the right index in displayList, but no DOM .ai-session-item gets rendered for it - so the .selected class lands on nothing, and whichever item was previously selected (often the pinned tmax session at index 0) appears to stay highlighted.\n\nFix: when auto-highlight resolves the focused pane's session, also remove that session's group key from collapsedGroups so the row actually renders.\n\nPlaywright tests now cover four scenarios:\n1. Auto-link rebinds focused pane to superseding session in same cwd.\n2. Non-focused panes never get their binding stolen.\n3. Visual highlight matches focused pane (groupByRepo off).\n4. Visual highlight survives groupByRepo + auto-collapse (groupByRepo on with collapsed groups).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed sticky AI session binding that caused the AI Sessions sidebar to highlight the wrong session for the focused pane.

Why:
- updateTerminalTitleFromSession in terminal-store.ts skipped any terminal whose aiSessionId was already set ("if (t.aiSessionId) continue;"). Once a terminal got linked, that link was permanent - even when the user closed the original AI process and started a fresh one in the same pane/cwd. The auto-highlight in CopilotPanel faithfully showed terminal.aiSessionId, so the sidebar pointed at a now-superseded session.

What changed:
- terminal-store.ts:2380-2388: the auto-link loop now allows the focused pane to rebind even when it already has an aiSessionId from a previous (stale) session, provided the cwd matches and the new session is different. Non-focused panes with an existing link remain off-limits so background panes never get their sessions silently moved.

Tests:
- tests/e2e/session-sidebar-highlight.spec.ts: 2 tests pinning the supersession behavior and the non-focused safety net. Both rely on a wiped real-session fixture and addClaudeCodeSession to drive auto-link deterministically without launching real claude.exe.
- 10 adjacent AI-session tests verified green (smoke, jump-to-prompt x4, pane-menu-show-prompts, pin-sessions-persist, issue-69-group-by-repo, jump-to-prompt-scroll x2).

User impact:
- Clicking a pane in tmax now highlights the AI session actually running there. The "I renamed this dir to ClawPilot" repro - two panes, two sessions in different cwds, click right pane, sidebar highlights left pane's session - is no longer reproducible.

Second fix landed in same task: CopilotPanel auto-highlight effect now expands the target session's repo group before setSelectedIndex, so the .selected DOM node actually renders. This was the visible cause of the user's "wrong session highlighted" report - groupByRepo + #69 auto-collapse hid the focused session row, leaving stale highlight on whichever item was selected before.\n\nTwo new Playwright cases added to session-sidebar-highlight.spec.ts pin both behaviours.
<!-- SECTION:FINAL_SUMMARY:END -->
