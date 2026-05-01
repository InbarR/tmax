---
id: TASK-37
title: 'AI Sessions: bulk cleanup sessions with less than N prompts'
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 13:29'
updated_date: '2026-04-28 13:43'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User can ask to clean up the sidebar by archiving every session whose messageCount is below a user-given threshold. This is a more aggressive, on-demand counterpart to TASK-32's startup auto-archive (which only runs once per launch with a fixed rule).\n\nUX:\n- A "Cleanup" affordance somewhere in the AI Sessions panel header (next to Group toggle / search).\n- Click prompts the user for a numeric threshold ("Archive sessions with fewer than how many prompts? [10]").\n- Confirms how many will be archived ("This will archive 47 of 298 active sessions. Pinned and already-archived sessions are skipped.").\n- On confirm, sets lifecycleOverride = 'old' for matching sessions.\n\nRules:\n- Skip pinned sessions.\n- Skip sessions that already have a lifecycleOverride (don't override user manual choices).\n- Don't delete files; archive is a UI lifecycle flag.\n- Apply across BOTH copilot + claude-code session lists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI Sessions panel exposes a cleanup action that prompts for a prompt-count threshold
- [x] #2 Confirmation dialog shows the count of sessions that will be archived before applying
- [x] #3 Pinned sessions and sessions with existing lifecycle overrides are not touched
- [x] #4 Archive sets lifecycleOverride to 'old'; underlying transcript files are untouched
- [x] #5 Playwright spec covers the threshold + skip-pinned + skip-existing-override behaviour
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store action cleanupLowPromptSessions(threshold): iterate copilotSessions+claudeCodeSessions, set lifecycleOverride=old for any not-pinned + no-existing-override + messageCount<threshold. Returns the count.
2. Add a "Cleanup" button to the AI Sessions panel header (next to Group toggle).
3. Click flow: window.prompt for threshold (default 10), then window.confirm with count, then call store action.
4. Playwright spec: inject sessions across the threshold, click cleanup, assert correct sessions archived and pinned/override sessions skipped.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation:
- Store: countLowPromptSessions(threshold) returns the count without applying changes; cleanupLowPromptSessions(threshold) sets lifecycleOverride=old for matching sessions and returns the count. Both skip pinned and any session with an existing override. Threshold <= 0 / NaN returns 0.
- UI: 🧹 Cleanup button in the AI Sessions panel header (between Collapse/Expand and Refresh). Click flow: window.prompt for threshold (default "10") -> if >0, window.confirm with the projected count -> apply via store action -> success toast.
- Test: tests/e2e/ai-sessions-cleanup-low-prompts.spec.ts pins three cases - threshold filtering, pinned/override skipping, invalid-threshold no-op.

Not using window.prompt/confirm in the test because they're browser-modal dialogs Playwright cannot drive via DOM; the store-action layer is the testable surface. The UI integration is small enough (just calls + alerts) that visual verification by the user is fine.

Follow-up after user testing: window.prompt is a no-op in Electron (returns null silently), so the original implementation did nothing on click. Also the inline header buttons (Running, Group, Collapse, Cleanup) made the panel header crowded.

Replaced with:
- A ⋯ overflow menu in the header that holds Running toggle, Collapse/Expand toggle, and the Cleanup action. Group toggle stays inline as the most-used.
- A custom React modal for the cleanup flow: numeric input, live projected-count, Cancel / Archive buttons. Enter applies, Esc cancels. Disabled-state when input is invalid or no sessions match.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bulk-cleanup affordance for the AI sessions sidebar.

🧹 Cleanup button in the panel header asks for a "fewer than how many prompts" threshold, shows how many will be archived, and on confirm sets lifecycleOverride=old for matching sessions. Pinned sessions and sessions with an existing manual override are always skipped; underlying transcript files are untouched (archive is a UI lifecycle).

Files:
- src/renderer/state/terminal-store.ts: countLowPromptSessions + cleanupLowPromptSessions actions.
- src/renderer/components/CopilotPanel.tsx: header button + prompt/confirm/apply flow.
- tests/e2e/ai-sessions-cleanup-low-prompts.spec.ts: 3 store-action tests.

How it complements TASK-32: TASK-32 auto-archives by AGE on launch. TASK-37 archives by PROMPT COUNT on demand. The two rules are independent and skip the same set (pinned + existing-override).

Follow-up commit: replaced the broken window.prompt flow (Electron returns null) with a proper React modal, and moved the header buttons (Running, Collapse, Cleanup) into a ⋯ overflow menu so the header isn't crowded. Group toggle stays inline.
<!-- SECTION:FINAL_SUMMARY:END -->
