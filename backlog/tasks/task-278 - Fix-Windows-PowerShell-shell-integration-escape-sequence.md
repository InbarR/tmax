---
id: TASK-278
title: Fix Windows PowerShell shell integration escape sequence
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-08-02 08:30'
updated_date: '2026-08-02 08:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax injects its PowerShell prompt integration into both PowerShell 7 and Windows PowerShell 5.1, but uses the PowerShell 6+ backtick-e escape syntax. Windows PowerShell 5.1 therefore renders the OSC 7 sequence as visible prompt garbage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Windows PowerShell 5.1 emits a valid OSC 7 sequence without visible escape text
- [x] #2 PowerShell 7 current-directory tracking continues to work
- [x] #3 Automated coverage verifies the integration uses syntax supported by Windows PowerShell 5.1
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the PowerShell 6+ backtick-e escape with explicit ESC and BEL characters supported by Windows PowerShell 5.1 and PowerShell 7.
2. Add focused unit coverage for the generated integration script and its OSC 7 output construction.
3. Run the targeted unit test and package/type-check validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Replaced PowerShell 6+ backtick-e with explicit ESC/BEL characters supported by Windows PowerShell 5.1.
- Extracted the generated integration script into a testable module and added TASK-278 regression coverage.
- Confirmed identical OSC 7 byte output under Windows PowerShell 5.1 and PowerShell 7; all 169 unit tests passed and production Vite bundles built successfully.
- Full Forge packaging reached the copy phase but could not replace the locked out\\tmax-win32-x64 directory while the packaged app was in use.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed visible OSC 7 prompt garbage in Windows PowerShell 5.1 while preserving PowerShell 7 current-directory tracking.

Changes:
- Generate ESC and BEL with [char]27 and [char]7 instead of PowerShell 6+ backtick-e syntax.
- Isolate the generated integration script for focused regression coverage.
- Verify the current-directory file URI payload remains unchanged.

Validation:
- 169 unit tests passed.
- Identical OSC 7 bytes confirmed in Windows PowerShell 5.1 and PowerShell 7.
- Production Vite bundles built successfully.
<!-- SECTION:FINAL_SUMMARY:END -->
