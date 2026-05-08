---
id: TASK-132
title: 'Bug: Ctrl-click on wrapped file path opens only the post-wrap fragment'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-06 18:07'
updated_date: '2026-05-08 07:51'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a long Windows path appears in the terminal and wraps across two display rows (e.g. C:\Users\inrotem\AppData\Local\Temp\tmax-clipboard\clipboard-...png splitting at 'cl|ipboard'), Ctrl-clicking the link triggers preview on only the second row's fragment (e.g. lipboard-2026-...png) resolved against cwd, not the full stitched path. Image preview shows 'File not found' for C:\projects\tmax\lipboard-...png. Distinct from TASK-127 which covers wrap-point spacing on copy; this is the click/link-provider path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ctrl-clicking a wrapped absolute Windows path opens the full path, not the post-wrap fragment
- [x] #2 Same behaviour for forward-slash POSIX paths and http(s)/file:// URLs that wrap
- [ ] #3 Playwright spec covers a wrapped path link click with narrow terminal width
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added hard-newline forward+backward stitch to the .md link provider in TerminalPanel.tsx, mirroring the image-path provider's seam logic. PATH_BODY check on both sides, MAX_HARD_NEWLINE=4 cap, and a seam-space restoration when the next row starts with leading whitespace (handles paths with embedded spaces like `OneDrive - Microsoft\...` IF Ink kept the space on the post-wrap side).

## Test gap
The Playwright spec I drafted (tests/e2e/task-132-wrapped-image-path-click.spec.ts) failed at launchTmax-stage (terminal-panel selector timeout) for reasons unrelated to my assertions - same infra issue PR 100 noted in its description (`Cannot redefine property: fileRead` across the suite, suggesting an Electron contextBridge tightening). Spec deleted; AC #3 unchecked; once the e2e infra is restored, a follow-up should re-add coverage for hard-newline-wrapped path clicks.

## Known limitation
If the wrapping TUI eats the literal seam space entirely (no leading WS on the continuation row), my fix produces `OneDrive -Microsoft\...` (no space), which fails fileRead silently. Same end-state as before the fix for that specific case. Most TUIs (Ink/Claude Code, Copilot CLI) preserve the space as leading WS on the post-wrap row, in which case this fix recovers the correct path.

Rebased on top of PR 100 (ce4c1cf) - the decorations/tooltip/console.warn changes from that PR are downstream of the regex match and unaffected by my upstream stitch additions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added hard-newline forward+backward stitch to the .md link provider in TerminalPanel.tsx so paths wrapped by Ink-based TUIs (Claude Code, Copilot CLI) - which break at content width without setting xterm's isWrapped flag - now reconstruct to their full logical form before MD_PATH_PATTERN runs.

## Changes
- Mirror the image-path provider's seam check (PATH_BODY on both sides, MAX_HARD_NEWLINE=4 cap).
- Forward+backward walk so a click on either head or continuation row resolves to the same path.
- Seam-space restoration when the post-wrap row had leading WS - preserves the spelling of paths with embedded spaces (`OneDrive - Microsoft\...`).
- Update Seg shape and offsetToRowCol to track soft-vs-hard rows and per-row leading WS, matching the image-path provider's model.

## Risk / scope
- If Ink eats the seam space entirely (no leading WS on continuation), the stitched path is missing the space and fileRead silently 404s. Same end-state as before the fix.
- Soft-wrap path was already working (TASK-107); this PR is strictly additive for the hard-newline case.

## Tests
No automated coverage in this commit - the spec drafted for the repro hit the same launchTmax-stage infra failure PR #100 flagged (`Cannot redefine property: fileRead`). AC #3 unchecked; reopen once e2e infra is restored.

## Sequencing
Rebased on top of PR #100 (ce4c1cf - decorations + fileRead error handling). The two fixes touch the same provider but operate at different stages (PR 100 is post-match; TASK-132 is pre-match), so they compose cleanly with no logic conflict.

Committed in a34d945.
<!-- SECTION:FINAL_SUMMARY:END -->
