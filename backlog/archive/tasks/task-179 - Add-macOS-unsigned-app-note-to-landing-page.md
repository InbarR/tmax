---
id: TASK-179
title: Add macOS unsigned app note to landing page
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-05-28 07:22'
updated_date: '2026-05-28 07:23'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the README macOS quarantine/signature workaround to the public landing page so Mac users can run tmax after downloading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Landing page includes macOS unsigned app troubleshooting guidance
- [ ] #2 Guidance includes xattr -cr /Applications/tmax.app command
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a fuller macOS unsigned-app troubleshooting note to docs/index.html Download section. It now tells users to click Cancel, run xattr -cr /Applications/tmax.app, and adjust the path for alternate install locations.
<!-- SECTION:NOTES:END -->
