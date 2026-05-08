---
id: TASK-140
title: 'Feature: shimmer the window when an AI session is waiting for the user'
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-08 08:40'
updated_date: '2026-05-08 14:22'
labels:
  - enhancement
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested in https://github.com/InbarR/tmax/issues/98 by @ofek01001. When a Claude Code or Copilot session is paused waiting for user input/approval, the user wants a subtle visual cue on the tmax window itself (shimmer / pulse / glow) so they notice from another monitor without having to alt-tab. Native AI session notifications (toast) already exist; this is a complementary in-window cue for users who silence notifications.\n\nDesign considerations: must be subtle (not flashy), respect prefers-reduced-motion, and turn off automatically once the session is no longer waiting (status changes back to active or idle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When any AI session in any visible workspace transitions to 'waiting for user', the window shows a subtle shimmer / pulse on the title bar or border
- [x] #2 Shimmer stops automatically when the session is no longer waiting
- [x] #3 Setting toggle to disable the shimmer for users who prefer notifications only
- [x] #4 Respects prefers-reduced-motion (no animation)
- [x] #5 Does not interfere with focus / typing / other window state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add aiShimmerEnabled boolean to AppConfig in src/main/config-store.ts (default true)
2. Add @keyframes shimmer + .shimmer-active class in src/renderer/styles/global.css using --focus-border accent token; respect prefers-reduced-motion (replace pulse with static border)
3. In src/renderer/App.tsx: derive isAnyAiSessionWaiting from copilotSessions+claudeCodeSessions (status awaitingApproval|waitingForUser); track windowFocused via document.hasFocus + focus/blur listeners; toggle shimmer-active class on .app-shell when waiting && !focused && config.aiShimmerEnabled
4. Add Settings.tsx toggle "AI session shimmer" near aiSessionNotifications
5. Run npx tsc --noEmit to check types
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added aiShimmerEnabled boolean to AppConfig in src/main/config-store.ts (default true)
- Added @keyframes ai-shimmer-pulse + .app-shell.shimmer-active in src/renderer/styles/global.css; uses --focus-border (#89b4fa) for an inset 2px ring + soft 18px inset glow; 2.4s ease-in-out infinite cycle
- prefers-reduced-motion media query swaps the animation for a static inset border so motion-sensitive users still get the cue without pulse
- src/renderer/App.tsx: derived isAnyAiSessionWaiting from copilotSessions+claudeCodeSessions (status awaitingApproval | waitingForUser), tracked windowFocused via document.hasFocus + window focus/blur listeners, computed shimmerActive = enabled && waiting && !focused, applied .shimmer-active conditionally on .app-shell
- Settings.tsx: added "AI session shimmer" toggle right after the existing "AI session notifications" row in the Terminal tab
- npx tsc --noEmit shows only the ~30 pre-existing repo errors; no new errors in App.tsx/Settings.tsx/config-store.ts
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an unfocused-window shimmer cue triggered when any AI session is in awaitingApproval / waitingForUser state. CSS-only animation (@keyframes ai-shimmer-pulse on .app-shell.shimmer-active, 2.4s inset ring + soft glow in --focus-border), works identically across Win/Mac/Linux. Respects prefers-reduced-motion (collapses to a static border). App.tsx derives isAnyAiSessionWaiting from both copilot and Claude Code session lists, watches document.hasFocus() via window focus/blur listeners, and only shimmers when enabled && waiting && !focused. New aiShimmerEnabled config setting (default true) with a Settings toggle next to AI session notifications. Shipped in e90f5d6.
<!-- SECTION:FINAL_SUMMARY:END -->
