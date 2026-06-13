---
id: TASK-157
title: Right-click shows 'Copied to clipboard' toast when nothing was copied
status: Done
assignee:
  - '@claude'
created_date: '2026-06-11 13:51'
updated_date: '2026-06-13 13:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Same user report: 'unable to copy anything from the session although copied to clipboard appears.' The terminal right-click copy fired the toast (and wrote clipboard) even when the selection / TUI buffer-snapshot was empty or whitespace. Fix: only write+toast when the text is non-empty after trim. Shift+drag remains the reliable selection path in mouse-tracking TUIs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Right-click with an empty/whitespace selection does NOT toast 'Copied to clipboard'
- [ ] #2 Real (non-empty) copies still write the clipboard and toast
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix applied in working tree (src/renderer/components/TerminalPanel.tsx): right-click copy now only writes clipboard + toasts when the text is non-empty after trim, in both the selection and TUI-snapshot paths. Verified it does not regress real copies (the one task-120 failure is a pre-existing local flake - fails with the change stashed too). Pending commit + release.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Right-click no longer toasts 'Copied to clipboard' for a whitespace-only/empty selection - copy + toast are gated on text.trim(). Shipped in the terminal-fixes commit.
<!-- SECTION:FINAL_SUMMARY:END -->
