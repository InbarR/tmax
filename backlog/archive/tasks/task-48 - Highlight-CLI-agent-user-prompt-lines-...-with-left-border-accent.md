---
id: TASK-48
title: Highlight CLI agent user prompt lines (> ...) with left-border accent
status: In Progress
assignee:
  - '@inbar'
created_date: '2026-05-01 07:51'
updated_date: '2026-05-01 07:51'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When using Copilot CLI / Claude Code in tmax, user prompts and agent responses are visually indistinguishable - both are just terminal text. This makes it hard to scan a long conversation history and see where prompts begin. Approach (Option A): scan newly-written normal-buffer lines for the heuristic ^>\s after each rAF flush in TerminalPanel.tsx, and attach an xterm IDecoration as a 1-cell-wide left-border accent bar (color #7CB342, top layer). Decorations live on xterm markers so they auto-dispose with scrollback. Alt-screen TUIs (vim/htop/less) are skipped to avoid noise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Lines starting with >  in the normal buffer get a green left-border accent
- [x] #2 Alt-screen TUIs (vim/less/htop) are not decorated
- [x] #3 Decorations dispose on terminal teardown (no leaks)
- [x] #4 Heuristic does not require any CLI-specific protocol - works for any tool that uses >  prompt markers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add scanForPromptLines() in TerminalPanel.tsx useEffect: walk normal-buffer lines from lastScanned to cursor, match /^>\s/, register marker + 1-cell decoration; 2. Call it from flushPendingData write callback so decorations apply post-render; 3. Dispose decorations + clear key set in useEffect cleanup; 4. Build out-next and verify visually
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added prompt-line decoration scanner in TerminalPanel.tsx (~20 lines). After each rAF batch flush, walks newly-written normal-buffer lines, matches lines starting with `> `, registers an xterm IDecoration as a 1-cell wide green (#7CB342) left-border accent bar tied to a marker so it auto-disposes with scrollback. Alt-screen buffers are skipped. Decorations cleaned up on terminal teardown. Heuristic only - no CLI protocol required.
<!-- SECTION:FINAL_SUMMARY:END -->
