---
id: TASK-279
title: Detach Backlog board into a floating window
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-08-05 06:38'
updated_date: '2026-08-05 06:54'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow the Backlog board to open in its own native tmax window so it can remain visible on another monitor while the main window is used for terminal work. Preserve the existing docked Backlog experience and shared board state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Backlog board provides an action to open it in a separate native window
- [x] #2 The detached Backlog window can be moved to another monitor and used independently while terminals remain usable in the main window
- [x] #3 Board state and task updates stay consistent between docked and detached views without duplicate conflicting windows
- [x] #4 Closing the detached Backlog window safely returns to the docked experience and does not affect terminal sessions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add dedicated Backlog-window IPC channels and preload APIs, backed by a singleton BrowserWindow in the Electron main process with external-link safety and cross-platform native window behavior.
2. Add a detached Backlog renderer entry that loads config into the existing store and renders BacklogBoard without terminal UI.
3. Refactor BacklogBoard with detached-window props so its close/Escape behavior closes the native window, dock-only controls are hidden, and an Open in window action detaches the board from the main view.
4. Notify the main renderer when the Backlog window closes so the docked board is restored, while preventing duplicate detached windows by focusing the existing singleton.
5. Add focused tests for window-mode routing and lifecycle behavior, then run targeted unit tests and package validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added a singleton native BrowserWindow for Backlog with safe external-link handling and a dedicated renderer route.
- Added an Open in separate window action; the main board stays suppressed while detached and is restored when the native window closes.
- Reused the existing BacklogBoard and preload task APIs so edits write through the same backend without duplicate board windows.
- Added renderer-mode regression coverage; all 177 unit tests pass and Electron Forge packaging succeeds.

- Follow-up: hid panel-side and collapse controls in the detached native window because they only apply to docked mode.

- Follow-up: when the floating Backlog window already exists, the main Backlog button now restores it from minimized state and focuses it instead of opening a docked duplicate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a detachable native Backlog window so the board can stay open on another monitor while the main tmax window remains available for terminal work.

Changes:
- Added singleton Backlog BrowserWindow lifecycle and preload IPC APIs.
- Added a dedicated detached Backlog renderer that reuses the existing board UI and configuration.
- Added an Open in separate window header action, duplicate-view prevention, and automatic dock restoration on close.
- Preserved external-link safety and existing Backlog task editing behavior.

Validation:
- 177 unit tests passed.
- Electron Forge production packaging succeeded.

- Detached mode omits dock-only move-side and collapse controls.

- The main Backlog button restores and focuses an existing minimized floating window.
<!-- SECTION:FINAL_SUMMARY:END -->
