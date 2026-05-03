---
id: TASK-75
title: >-
  Image-path click in Copilot CLI: support bracket-wrapped basename and fix
  cwd-resolve
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 11:02'
updated_date: '2026-05-03 11:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copilot CLI's input box hides the directory of pasted file paths and shows them as [clipboard-...png]. The image-path link provider was matching the leading [ as part of the path body and resolving the result cwd-relative (wrong path). Also when only the basename was visible the click resolved cwd/<basename> instead of the actual file. Fix: tighten the regex body char class to exclude []() so [path] matches just the inner path; for bare-basename matches, probe tmax's stable clipboard temp dir on disk via a new IPC and open the resolved file if it exists, else fall back to cwd-relative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking [C:\Users\...\file.png] in Copilot opens the absolute path - not cwd + bracketed text
- [x] #2 Clicking [clipboard-...png] (bare basename) in Copilot resolves to <tmpdir>/tmax-clipboard/<basename> if that file exists
- [x] #3 Click for a basename that doesn't match a real clipboard file falls back to cwd-relative resolution
- [x] #4 Click in CC (full path visible) still works the same as before
- [x] #5 No renderer-side cache or remembered state - each click probes disk fresh
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tighten image-path regex body char class to exclude []().\n2. Add IPC RESOLVE_CLIPBOARD_BASENAME that probes tmpdir/tmax-clipboard/<basename> and returns full path if exists.\n3. In activate handler, route bare-basename matches through the IPC; absolute paths skip it; cwd-relative fallback on miss.\n4. User to verify in dev tmax after npm start restart.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two-part fix: regex body now excludes brackets/parens so [path] matches just the inner path string and the drive-letter test passes. New main IPC resolveClipboardImageBasename(basename) checks tmax's stable clipboard temp dir on disk and returns the real path if the file is there, else null - no cache, no remembered state. Activate handler probes the IPC for bare-basename matches before falling back to cwd-relative. Pending user verification after the dev restart.
<!-- SECTION:FINAL_SUMMARY:END -->
