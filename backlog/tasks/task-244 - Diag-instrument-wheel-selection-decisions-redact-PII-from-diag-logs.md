---
id: TASK-244
title: 'Diag: instrument wheel/selection decisions + redact PII from diag logs'
status: Done
assignee: []
created_date: '2026-06-16 13:20'
updated_date: '2026-06-16 13:20'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Mac mouse scroll/selection issue is non-deterministic and the existing diag log only records byte counts, so we couldn't tell whether the wheel is forwarded to the TUI or eaten by xterm scrollback, nor the buffer/tracking state. Add PII-free instrumentation so future captures pinpoint it. Also, shared diag logs leaked the user's home path/username (e.g. /Users/<name>/...) - redact centrally so logs are safe to share.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 renderer:wheel diag (throttled 1/s) logs the path taken (forward-to-pty / scrollLines / noop) plus tracking, bufferType, baseY, viewportY, deltaDir, aiPane - no content
- [x] #2 renderer:drag-select diag logs nativeSelection, aiPane, bufferType, tracking on each drag - no coordinates or text
- [x] #3 diagLog redacts the home dir (->~) and username (-><user>) from every string value before writing, on macOS and Windows
- [x] #4 Redaction never corrupts non-PII substrings (e.g. 'tmax')
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added two PII-free diag events in TerminalPanel.tsx: renderer:wheel (throttled 1/s, records forward-to-pty vs scrollLines decision + pane state) and renderer:drag-select (records the inputs to the synth-select decision). Added central PII redaction in diag-logger.ts: redactPII walks each payload's string values before serialization and strips the home dir (->~) and username (-><user>), with a word-boundary username match so it can't corrupt 'tmax'. Verified redaction on mac + windows homedir shapes; typecheck clean. Lets us pin the non-deterministic Copilot scroll/selection reports (forward-vs-eat) without leaking identity.
<!-- SECTION:FINAL_SUMMARY:END -->
