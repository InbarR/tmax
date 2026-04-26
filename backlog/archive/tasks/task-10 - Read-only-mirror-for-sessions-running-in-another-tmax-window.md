---
id: TASK-10
title: Read-only mirror for sessions running in another tmax window
status: To Do
assignee: []
created_date: '2026-04-26 10:28'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When tmax #1 has agency running in a pane, the user opens tmax #2 in the same cwd and expects to see the running session. Current auto-link gives them just the banner - the pane itself is a fresh pwsh prompt. Running 'agency --resume <id>' in tmax #2 would create a second writer on the same .jsonl - corruption. Build a read-only viewer that tails the .jsonl and renders the session timeline live (assistant messages, tool calls) without spawning a second agent process.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New SessionViewer component renders a streaming view of an active session
- [ ] #2 Auto-attaches when an unlinked terminal opens in a cwd matching an active session running elsewhere
- [ ] #3 Shows '👁 read-only mirror' badge so the user knows input is disabled
- [ ] #4 Detaches and reverts to a plain pwsh when the original session goes idle
- [ ] #5 No PTY writes, no risk of corrupting the .jsonl
<!-- AC:END -->
