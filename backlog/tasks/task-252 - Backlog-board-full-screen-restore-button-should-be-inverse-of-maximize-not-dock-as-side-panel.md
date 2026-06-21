---
id: TASK-252
title: >-
  Backlog board: full-screen restore button should be inverse-of-maximize, not
  'dock as side panel'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 10:29'
updated_date: '2026-06-21 15:05'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the Backlog board is in full-window (overlay) mode, the single toggle button that returns it to the docked panel is rendered as a 'Dock as side panel' action (IconSidebar glyph + that label). Users expect the inverse of the Expand/Maximize button (a restore/shrink icon reading as 'exit full screen / restore'), since that's what un-maximizing means. The behavior already returns to the panel correctly - only the icon + label are misleading. In src/renderer/components/BacklogBoard.tsx the toggle (around the setMode call) shows IconExpand+'Expand to full window' in panel mode and IconSidebar+'Dock as side panel' in overlay mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In full-window mode, the restore button shows a shrink/restore icon (visual inverse of the maximize icon), not the sidebar/dock glyph
- [x] #2 Its title/aria-label reads as restore/exit-full-screen, not 'Dock as side panel'
- [x] #3 Clicking it still returns the board to the docked side panel (behavior unchanged)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Locate the panel/overlay toggle in BacklogBoard.tsx
2. Add IconShrink (inverse of IconExpand)
3. In overlay mode: use IconShrink + "Restore to panel" label instead of IconSidebar + "Dock as side panel"
4. Remove now-unused IconSidebar
5. Typecheck + visual verify
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the Backlog board's full-window restore control. In overlay (full-window) mode the toggle now shows IconShrink - arrows pointing inward, the visual inverse of the maximize icon - and reads "Restore to panel", instead of the sidebar glyph + "Dock as side panel". Behavior is unchanged (still returns to the docked panel); removed the now-unused IconSidebar. Renderer-only change in BacklogBoard.tsx; typecheck clean; user-confirmed visually.
<!-- SECTION:FINAL_SUMMARY:END -->
