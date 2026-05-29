---
id: TASK-181
title: >-
  Fix: Settings > Appearance freezes window for seconds (synchronous font
  enumeration)
status: Done
assignee:
  - '@claude'
created_date: '2026-05-29 08:54'
updated_date: '2026-05-29 08:56'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening Settings > Appearance freezes the whole window for a few seconds; toggles are unresponsive until it unblocks. Root cause: AppearanceSettings calls useAvailableFonts() on mount (Settings.tsx:576), which runs a synchronous canvas measureText loop over EVERY installed system font (Settings.tsx:104-111). On Windows with hundreds of fonts each measureText forces font-metric loading, blocking the renderer main thread. The result (availableFonts) is only ever consumed inside the font Face dropdown (Settings.tsx:665-692), which renders only when opened - so the work is both eager and blocking. Reported 2026-05-29.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening Settings > Appearance no longer freezes the window; toggles are immediately interactive
- [x] #2 Font 'Face' dropdown still lists monospace fonts correctly when opened
- [x] #3 Font enumeration runs at most once per session (cached) so reopening Settings is instant
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repro with Playwright: open Settings, switch to Appearance, assert a toggle is clickable within a tight time budget (currently blocked by the sync loop).\n2. Add a module-level cache (cachedMonoFonts) so font enumeration+filtering runs at most once per session; subsequent Settings opens return instantly.\n3. Make the measureText loop non-blocking: process fonts in small batches and yield to the event loop (await setTimeout 0) between batches so the renderer main thread stays responsive on first run. Guard against setState after unmount.\n4. Keep the same monospace-detection logic and FALLBACK_FONTS behavior; result identical, just non-blocking.\n5. Run the new spec single/headed; verify dropdown still populates and window no longer freezes.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed Settings > Appearance window freeze caused by synchronous font enumeration.

AppearanceSettings ran a blocking canvas measureText loop over every installed font on mount (hundreds on Windows), freezing the renderer main thread; the result is only used by the font Face dropdown.

Changes (src/renderer/components/Settings.tsx):
- Chunked the measureText loop into 40-font batches that yield to the event loop, keeping the UI responsive during monospace detection.
- Added a module-level cache + shared in-flight promise so enumeration runs at most once per session; reopening Settings is instant.
- Monospace detection and FALLBACK_FONTS behavior unchanged.

E2E test deferred per user request (just fix). Shipped in c7bb26f.
<!-- SECTION:FINAL_SUMMARY:END -->
