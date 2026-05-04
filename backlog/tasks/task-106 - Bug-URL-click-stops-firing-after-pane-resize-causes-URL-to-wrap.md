---
id: TASK-106
title: 'Bug: URL click stops firing after pane resize causes URL to wrap'
status: To Do
assignee: []
created_date: '2026-05-04 14:22'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: open fresh Copilot CLI pane, paste/echo a long URL on a single line, click - opens. Open another pane to shrink the original; the URL now wraps. Click - nothing. Resize back so URL is one line again - still nothing. window.__tmaxLinkActivates does not increment; activate handler is not being invoked even though underline decoration still renders. xterm's linkifier appears to get into a stuck state after the buffer reflow on resize, registering decorations but not firing click events on registered link ranges. Possibly related to TASK-104 (multi-fire dedupe) but separate failure mode (zero fires vs many).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a pane resize that wraps then unwraps a URL, click on the URL still opens the browser tab
- [ ] #2 window.__tmaxLinkActivates increments on every click whether URL is wrapped or not
- [ ] #3 Underline decoration matches click hit area in both wrapped and unwrapped states
<!-- AC:END -->
