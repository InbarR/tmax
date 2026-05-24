---
id: TASK-166
title: Fix .md preview not opening when path hard-wraps without literal spaces (phantom seam)
status: Done
assignee:
  - '@copilot'
created_date: '2026-05-21 17:10'
updated_date: '2026-05-21 17:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When Ink-based TUIs (Copilot CLI, Claude Code) hard-wrap a long .md path that has no embedded spaces, the continuation row starts with Ink's layout indent. The TASK-132/137 seam-space heuristic in TerminalPanel.tsx's .md link provider could not distinguish "wrap-eaten literal space" (`OneDrive - Microsoft\…`) from "pure layout indent" (`.../files/…`), so it always inserted a phantom space at the join.

User repro: terminal pane shrunk narrow enough to wrap a path printed by the Copilot CLI session-state directory; clicking the underlined link did nothing; DevTools console showed:

```
[md-link] fileRead returned null { fullPath: '/Users/mimer/.copilot/session-state/<id>/fi les/reddit-scout-2026-05-21.md' }
```

The real on-disk path was `…/files/…` — the seam-space heuristic inserted a phantom space between `fi` and `les`.

Fix: track each inserted seam-space offset during both forward and backward hard-newline stitching. In `activate()`, retry `fileRead` with the seam-stripped path when the primary read returns null. Primary (with seams) is tried first so legitimate paths like `OneDrive - Microsoft\file.md` still resolve normally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hard-newline-wrapped no-space path opens the preview when clicked (regression test added)
- [x] #2 Existing `OneDrive - Microsoft\...`-style paths still open via the primary attempt (no fallback needed)
- [x] #3 `fileRead` is called at most twice per click (primary + optional stripped fallback)
- [x] #4 Pre-existing TASK-107 e2e test cases unchanged (no behavioral regression in single-line, soft-wrapped, bare, or two-adjacent paths)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TerminalPanel.tsx's .md link provider now records the offset of every seam space inserted by the TASK-132/137 hard-newline-stitch heuristic. The `activate()` handler computes a seam-stripped variant of the matched path, tries `fileRead` on the primary (with-seam) path first, and falls back to the stripped path if the primary returns null. The first successful read drives the markdownPreview overlay. Order preserves backward compatibility: paths with genuine embedded spaces (OneDrive - Microsoft\…) still succeed on the primary attempt, while phantom-seam paths (Ink layout indent misread as wrap-eaten space) now recover on the fallback. Added a new e2e regression test (`phantom seam: hard-newline-wrapped no-space path falls back to stripped path on fileRead null`) plus a `installSelectiveFileReadSpy` helper that returns content only for the real path, asserting both that the primary attempt is tried first and that the fallback opens the overlay with the correct path.
<!-- SECTION:FINAL_SUMMARY:END -->
