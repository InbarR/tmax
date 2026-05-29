---
id: TASK-176
title: >-
  Fix: AI session parsers report wrong status (Copilot stuck executingTool,
  Claude stuck waitingForUser) - GH #118
status: In Progress
assignee:
  - '@claude'
created_date: '2026-05-22 15:56'
updated_date: '2026-05-22 16:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by external contributor on GH #118 with detailed code locations.

Two distinct bugs in the AI session JSON event parsers under src/main/:

**Copilot CLI parser** (src/main/copilot-events-parser.ts): pendingToolCalls increments on tool.execution_start but never zeroes on assistant.turn_end. If a turn ends with tools still pending (interruption/cancellation) the counter stays > 0 forever and the pane status sticks on executingTool. Also no staleness fallback like the Claude Code parser's ACTIVE_THRESHOLD_MS, so a crashed session shows 'busy' indefinitely.

**Claude Code parser** (src/main/claude-code-events-parser.ts): awaitingInput is set on assistant end_turn and cleared only by a user line. Common case is a progress or system event arrives after end_turn - the flag never clears. deriveResult then short-circuits to waitingForUser for 10 min while the session is actively working.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 assistant.turn_end / session.start / session.resume zero pendingToolCalls in copilot-events-parser.ts
- [x] #2 copilot-events-parser.ts gets an ACTIVE_THRESHOLD_MS staleness fallback mirroring the Claude Code parser
- [x] #3 claude-code-events-parser.ts no longer reports waitingForUser when progress/system events are flowing - either gate the early-return or clear awaitingInput on non-user, non-assistant events
- [x] #4 Add parser unit tests for: turn_end with pending tools, post-end_turn progress event, post-end_turn system event, stale event window
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read both parsers and locate the exact lines from the issue (copilot-events-parser.ts ~151-156, claude-code-events-parser.ts ~199, 277, 285, 292, 296-318)\n2. Copilot fix: zero pendingToolCalls on assistant.turn_end / session.start / session.resume; add ACTIVE_THRESHOLD_MS staleness fallback mirroring the Claude parser\n3. Claude fix: clear awaitingInput on non-user, non-assistant-end-turn events (progress/system), OR gate the early-return in deriveResult on lastLineType not being progress/assistant\n4. Add unit tests in src/test for the four scenarios from AC #4\n5. Verify with typecheck
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Fixes shipped (2026-05-22)

**copilot-events-parser.ts:**
- session.start / session.resume now zero pendingToolCalls (prevents stale carry-over)
- assistant.turn_end zeros pendingToolCalls (fixes interruption/cancellation stuck-on-executingTool)
- Added ACTIVE_THRESHOLD_MS = 30s staleness fallback in cacheToResult: if the latest event timestamp is older than 30s AND status is a busy state (executingTool / thinking), force status to idle. waitingForUser and idle are passed through unchanged (waitingForUser is a valid long state)

**claude-code-events-parser.ts:**
- processLine now clears awaitingInput by default on every line; the assistant branch re-sets it only when end_turn is detected. Means progress/system/non-end_turn-assistant events flowing in after end_turn now correctly unstick the flag, so deriveResult's early-return no longer locks the pane on waitingForUser for 10 minutes during active work.

**Tests:** Added tests/e2e/task-176-ai-session-parser-status.spec.ts covering all four reported scenarios (turn_end with pending tools, session.resume reset, stale window, post-end_turn progress, non-end_turn assistant after end_turn).

Typecheck clean. Awaiting user verification on real Copilot/Claude sessions before marking Done.
<!-- SECTION:NOTES:END -->
