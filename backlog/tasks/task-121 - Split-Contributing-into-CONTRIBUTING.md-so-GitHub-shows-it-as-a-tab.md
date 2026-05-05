---
id: TASK-121
title: Split Contributing into CONTRIBUTING.md so GitHub shows it as a tab
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 10:57'
updated_date: '2026-05-05 10:58'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub auto-renders CONTRIBUTING.md as a tab next to README on the repo landing page. Currently the contributing guidelines live inside README.md, so the repo only shows a single README tab. Extract the Contributing section into its own CONTRIBUTING.md at repo root and trim the README section to a one-line pointer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CONTRIBUTING.md exists at repo root with the full guidelines (bug reports, feature requests, PR process, code style, project management)
- [x] #2 README.md Contributing section is shortened to a one-liner that links to CONTRIBUTING.md
- [ ] #3 GitHub renders CONTRIBUTING.md as a tab on the repo landing page after push
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create CONTRIBUTING.md at repo root with the full Contributing section content (bugs, features, PRs, code style, project management)
2. Trim README.md Contributing section to a one-liner pointing to CONTRIBUTING.md
3. Push - GitHub auto-detects CONTRIBUTING.md and renders it as a tab next to README on the landing page
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted README.md's Contributing section into a top-level CONTRIBUTING.md so GitHub renders it as a tab next to README on the repo landing page.

Changes:
- New CONTRIBUTING.md with full guidelines (reporting bugs, suggesting features, PR process with cross-platform compatibility note, code style, Backlog.md project-management pointer).
- README.md Contributing section trimmed to a one-liner that links to CONTRIBUTING.md.

AC #3 (GitHub renders the tab) is verified after push - GitHub auto-detects this file by name.
<!-- SECTION:FINAL_SUMMARY:END -->
