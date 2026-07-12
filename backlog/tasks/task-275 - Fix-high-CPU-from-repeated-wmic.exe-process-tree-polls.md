---
id: TASK-275
title: Fix high CPU from repeated wmic.exe process-tree polls
status: In Progress
assignee:
  - '@copilot-cli'
created_date: '2026-07-12 16:13'
updated_date: '2026-07-12 16:15'
labels: []
dependencies: []
references:
  - src/main/process-tree.ts
  - src/renderer/components/TerminalPanel.tsx
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report: tmax spawns 4-5 wmic.exe processes continuously, driving WMI Provider Host to 19-23% CPU. Root cause: mouse-mode reset poll and agent-relink poll each call getPtyChildProcesses (wmic) every 5s per pane, permanently. With multiple AI panes that's dozens of wmic calls/minute.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Consolidate per-pane wmic polls into a single batch query or replace wmic with lighter alternative (tasklist)
- [ ] #2 Increase poll interval from 5s to at least 15s for ongoing mouse-mode and relink checks
- [ ] #3 Stop polling for panes that are not visible or are backgrounded
- [ ] #4 CPU from process-tree polling stays under 2% in steady state with 5+ AI panes
<!-- AC:END -->
