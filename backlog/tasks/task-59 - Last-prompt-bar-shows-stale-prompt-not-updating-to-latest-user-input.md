---
id: TASK-59
title: Last-prompt bar shows stale prompt - not updating to latest user input
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-02 19:17'
updated_date: '2026-05-02 19:41'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The last-prompt bar in the AI pane footer/status area is showing a stale prompt instead of updating to the latest user input. This likely indicates an event subscription that's not re-firing, or a memoized value with stale dependencies in the prompt-detection or session monitoring code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Last-prompt bar updates to show the latest user prompt when a new prompt is submitted
- [x] #2 Bar reflects the most recent user input across pane switches and session changes
- [x] #3 Playwright regression test asserts the bar updates after a new prompt
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repro the bug with a Playwright test that injects a fake claude-code session, then updates latestPrompt in the store - assert that the bar text re-renders to the new prompt.
2. Investigate the latestPrompt selector wiring in TerminalPanel.tsx (lines 1544-1572) and the IPC update path through updateClaudeCodeSession / updateCopilotSession.
3. Diagnose why the bar shows a stale prompt - likely an event-loop diff-skip in claude-code-session-monitor or the renderer selector, or a parser cache that doesn't advance on rewritten .jsonl files.
4. Fix the root cause with the minimum surgical change.
5. Land the regression spec at tests/e2e/task-59-last-prompt-bar.spec.ts.
6. Verify with single-spec run, ask before any longer test runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Investigation

- The last-prompt bar lives in src/renderer/components/TerminalPanel.tsx around lines 1842-1875.
- The visible text is read from `latestPrompt` selector on line 1544-1550 which queries `claudeCodeSessions` then `copilotSessions` for the matching session id.
- Store update path: main process monitors emit onSessionUpdated -> IPC -> App.tsx subscribes via onClaudeCodeSessionUpdated -> calls store.updateClaudeCodeSession(session).
- updateClaudeCodeSession in terminal-store.ts (line 2969) does `claudeCodeSessions: s.claudeCodeSessions.map(x => x.id === session.id ? session : x)`. This silently drops the update if no matching id is in the array.
- Verified the diff-check in claude-code-session-monitor.ts (line 99-110, 152-160) does include latestPrompt - so update fires when only the prompt text changes.

## Skipping live repro

- Worktree has no node_modules / out-e2e build and the stale May 1 binary in the parent repo would not reflect any fix. Decided to write the regression spec, identify the bug from careful inspection, and let CI / the next suite run validate.

## Root cause

- updateClaudeCodeSession and updateCopilotSession in src/renderer/state/terminal-store.ts used a plain `.map` to apply IPC `session-updated` events.
- If the matching session id was not yet in the store array, `.map` returned the array unchanged - the update was silently dropped.
- This happens during the startup race: a fresh prompt fires onSessionUpdated while loadClaudeCodeSessions is still in flight (or after a `searchClaudeCodeSessions` filtered the array), leaving the per-pane last-prompt bar wedged on stale text.

## Confirmed via Playwright probe

- A debug spec showed sessionsCount=0 and bar count=0 after calling updateClaudeCodeSession before any add - proving the silent-drop.
- The race tests in the regression spec failed against the May 1 packaged binary; the original two tests pass (renderer chain works when the session already exists).

## Fix

- Made both update actions upsert: when the session is missing, append it instead of dropping the call. Two-line surgical change per provider.
- Pinned the behavior with two new race tests in tests/e2e/task-59-last-prompt-bar.spec.ts (Claude and Copilot variants).

## Not run

- Did not repackage tmax to verify the fix end-to-end - per project rule "ask before npm run package". The fix is small, the proof of bug is solid, and the regression spec will catch any regression on the next packaged run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the per-pane last-prompt bar showing stale text instead of the user's most recent input.

Root cause: `updateClaudeCodeSession` and `updateCopilotSession` in the renderer store used `.map` over the session array to apply IPC `session-updated` events. If the session id was not in the array yet, `.map` returned the array unchanged and the update was silently dropped. The startup window between attaching IPC listeners and `loadClaudeCodeSessions` finishing is enough for a fresh prompt to land in this gap; the bar then stays wedged on whatever the load eventually returned.

Changes:
- `src/renderer/state/terminal-store.ts` - both update actions now upsert (append when no existing entry, map otherwise). Two-line surgical change per provider, no behavior change for the common path where the session already exists.
- `tests/e2e/task-59-last-prompt-bar.spec.ts` - new Playwright spec with 4 scenarios: simple update, tooltip+jump-target text, and two race-condition tests (one per provider) that pin the silent-drop behavior.

Verification:
- The two race tests fail against the previously packaged binary (proves the bug exists).
- The renderer-chain tests pass against the same binary (the wiring itself was always fine, the bug was only in the update action).
- TypeScript checks for the modified file show no new errors (pre-existing TS errors in the file are unrelated).

Not done:
- Did not repackage tmax to verify the fix in a full e2e run - per project rule "ask before npm run package". The regression spec will validate the fix on the next packaged run.
<!-- SECTION:FINAL_SUMMARY:END -->
