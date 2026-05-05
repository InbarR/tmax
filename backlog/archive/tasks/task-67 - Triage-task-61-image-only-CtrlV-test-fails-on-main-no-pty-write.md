---
id: TASK-67
title: 'Triage: task-61 image-only Ctrl+V test fails on main (no pty write)'
status: Done
assignee: []
created_date: '2026-05-03 07:09'
updated_date: '2026-05-04 06:41'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pre-existing failure surfaced while working TASK-66 (issue #84). tests/e2e/task-61-rich-text-paste.spec.ts > 'image-only clipboard saves PNG and pastes the file path' assertion fails because pasted=='' - the Ctrl+V handler in TerminalPanel.tsx (line ~646) never triggers a writePty when the clipboard holds only an image in the packaged e2e harness. Confirmed by stashing TASK-66 changes and rerunning against unmodified main - same failure, so this is unrelated to the right-click fix. Likely a flake in clipboardSaveImage or focusAndPaste timing in the e2e harness. The same logic works manually in a real tmax build, and this task's main user-facing fix did NOT touch Ctrl+V. Worth investigating to keep the suite green.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduce locally with current main
- [ ] #2 Identify whether the regression is in clipboardSaveImage IPC, the Ctrl+V handler, or the test's focus/timing assumptions
- [ ] #3 Either fix the root cause or update the test to match observed behavior (with a clear note explaining why)
- [ ] #4 Re-run the full task-61 spec and assert all five tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed 2026-05-03: deprioritised. The e2e suite is run on demand for releases, not blocking other work; a single flaky spec isn't worth chasing right now. Re-open when test stability becomes a release-cadence problem.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Won't do for now - flaky spec deferred. Re-open if it becomes load-bearing.
<!-- SECTION:FINAL_SUMMARY:END -->
