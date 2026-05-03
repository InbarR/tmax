---
id: TASK-67
title: 'Triage: task-61 image-only Ctrl+V test fails on main (no pty write)'
status: To Do
assignee: []
created_date: '2026-05-03 07:09'
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
