---
id: TASK-107
title: >-
  Bug: Ctrl+click on .md path fails when path contains spaces or wraps across
  rows
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 17:54'
updated_date: '2026-05-04 19:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: terminal shows a .md path containing spaces (e.g. C:\Users\you\OneDrive - Microsoft\Vault\note.md) and the line wraps across two rows. Ctrl+click on either row does nothing useful - either no link is registered (regex stops at first space) or only the bare tail filename is linkified, which then fails to open because the path is incomplete.

Two stacked bugs:
A) The .md path regex in src/renderer/utils/md-link-parser.tsx and the duplicated copy in src/renderer/components/TerminalPanel.tsx both exclude whitespace from the path body, so any space cuts the match short. PR #89 from a teammate proposed the regex fix; we are reimplementing cleaner.
B) The xterm link provider for .md paths in TerminalPanel.tsx reads only the current buffer line. When the path wraps (xterm soft-wrap), neither row sees the full logical path. The URL link provider above it already walks isWrapped chains - we need the same treatment for .md.

Both fixes ship together because the user-visible bug (path with spaces, on a narrow pane) needs both to behave correctly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single-line .md path containing spaces (e.g. 'OneDrive - Microsoft') is fully clickable end-to-end
- [x] #2 Multi-row soft-wrapped .md path is clickable from any row it visually occupies, and click reconstructs the full logical path
- [x] #3 Ctrl+click on a wrapped .md path opens the markdown preview with the correct reconstructed file path
- [x] #4 Existing detection still works: bare README.md, ~/path, ./path, ../path, /path, C:\path
- [x] #5 Pattern is defined once and shared between md-link-parser.tsx (chat) and TerminalPanel.tsx (terminal)
- [x] #6 Playwright spec covers wrapped+spaces repro and the bare/single-line cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. md-link-parser.tsx: replace MD_PATH_REGEX with MD_PATH_PATTERN as a string derived from a regex literal via .source. Two-branch regex: anchored prefix (drive/UNC/POSIX/~/./..) allows spaces, lazy +? stops at first .md\b. Bare branch (no prefix) excludes spaces. Use 'gi' flag in renderWithMdLinks for consistency with terminal side.\n\n2. TerminalPanel.tsx: import MD_PATH_PATTERN, replace the simple single-line .md link provider at ~617-657 with a soft-wrap-aware version. Mirror the URL provider pattern (lines 410-614) but skip the hard-newline stitch (paths don't get hard-wrapped by CLIs the way URLs do). Walk isWrapped back/forward, concat row text into a logical buffer, run regex once, map matches back to per-row x/y ranges using offsetToRowCol. Clip emitted ranges to the queried row only (otherwise xterm registers one link per row and click fires N times).\n\n3. Playwright spec tests/e2e/task-107-md-path-wrap-and-spaces.spec.ts:\n   - spy on terminalAPI.fileRead and on the markdownPreview store key\n   - case A: wide cols, write 'C:\Users\you\OneDrive - Microsoft\Vault\note.md', click mid-path, assert fileRead called with full path\n   - case B: narrow cols (term.resize), write same path so it wraps across rows, click on row1 AND row2, assert fileRead called with the FULL reconstructed path each time\n   - case C: bare README.md still works (regression guard)\n   - case D: two paths same line stay separate\n\n4. Manual sanity: build-swap, drag pane to repro user's exact case, ctrl-click the wrapped path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- regex fix: anchored vs bare branches (md-link-parser.tsx:6-22) using `/regex/.source` so the source code reads as a normal regex literal
- soft-wrap walk in TerminalPanel.tsx mirrors the URL provider (isWrapped chain, segs+offsetToRowCol, per-row range clipping)
- imported MD_PATH_PATTERN into TerminalPanel; both call sites now use new RegExp(MD_PATH_PATTERN, 'gi') for consistent case handling
- Playwright spec: single-line spaces, soft-wrapped (head+tail clicks), bare README, two-paths-same-line
- user confirmed manual repro now works; commit 5ac6048
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fix Ctrl+click on `.md` paths that contain spaces or wrap across terminal rows.

## Problem
Two stacked bugs:
- **Spaces**: regex excluded whitespace from the path body, so a Windows path like `C:\Users\you\OneDrive - Microsoft\Vault
ote.md` got cut at the first space. Click opened the wrong file or did nothing.
- **Wrap**: the xterm link provider for `.md` paths read only one buffer row at a time. When the path soft-wrapped (narrow pane), the head row had no `.md` (no match), and the tail row matched as a bare filename - which then resolved to the wrong file under cwd.

## Fix
**Regex** (`src/renderer/utils/md-link-parser.tsx`): two-branch `MD_PATH_PATTERN` exposed as a `.source` string.
1. Anchored branch (drive `C:\`, UNC `\`, leading `/`, `~/`, `./`, `../`) allows spaces in the body, lazy `+?` stops at the first `.md`.
2. Bare branch (e.g. `README.md`) keeps the no-space rule.

Single source of truth - imported by both the chat parser (`renderWithMdLinks`) and the xterm link provider in `TerminalPanel.tsx`. Both call sites now use `new RegExp(MD_PATH_PATTERN, 'gi')` so the chat side and terminal side handle case identically.

**Soft-wrap walk** (`src/renderer/components/TerminalPanel.tsx`): the `.md` link provider now walks `isWrapped` back/forward to gather the full logical line, runs the regex once on the joined text, and maps matches back to per-row x/y ranges via an `offsetToRowCol` helper - mirroring the URL provider directly above. Emitted ranges are clipped to the queried row only (otherwise xterm fires `activate()` once per row a multi-row link spans).

No hard-newline stitch - paths, unlike URLs from `gh auth login`, do not get hard-wrapped by CLIs at fixed column counts.

## Tests
`tests/e2e/task-107-md-path-wrap-and-spaces.spec.ts` covers:
- Single-line path with spaces (`OneDrive - Microsoft`) - clickable end-to-end
- Soft-wrapped path - clickable on EITHER head or tail row, both reconstruct full path; continuation rows verified `isWrapped: true`; ranges verified clipped to one row
- Bare `README.md` resolves against cwd (regression guard)
- Two adjacent `.md` paths on one line stay separate (lazy `+?` works)

## Risk / follow-ups
- Pre-existing not addressed: `(README.md)` still captures the leading `(`. Not introduced by this PR; same behavior as before.
- Pre-existing not addressed: `https://example.com/foo.md` still partial-matches via the `s:/` drive-letter prefix. Same behavior as before.
<!-- SECTION:FINAL_SUMMARY:END -->
