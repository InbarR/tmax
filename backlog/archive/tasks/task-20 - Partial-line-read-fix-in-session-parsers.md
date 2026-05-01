---
id: TASK-20
title: Partial-line read fix in session parsers
status: Done
assignee: []
created_date: '2026-04-26 11:01'
updated_date: '2026-04-26 11:01'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parsers were dropping individual messages when read-window ended mid-line: half-line failed JSON.parse, byteOffset advanced past it, second half on next poll also failed. Now slice to last newline only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No messages dropped during heavy streaming
- [x] #2 byteOffset advances only by completeBytes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in fe99f9f
<!-- SECTION:FINAL_SUMMARY:END -->
