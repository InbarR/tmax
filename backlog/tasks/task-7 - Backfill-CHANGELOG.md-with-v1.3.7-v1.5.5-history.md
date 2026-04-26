---
id: TASK-7
title: Backfill CHANGELOG.md with v1.3.7 - v1.5.5 history
status: To Do
assignee: []
created_date: '2026-04-26 10:26'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CHANGELOG.md is frozen at v1.3.6 and v1.3.4. The website's full-changelog view (rendered from the file) and the in-app changelog modal both look stale because of this. Generate sections from git log between each tag and prepend them, ordered newest-first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CHANGELOG.md contains a section for each released version v1.3.7 through v1.5.5
- [ ] #2 Each section has a date and a bullet list of notable commits (excluding chore: download stats snapshot noise)
- [ ] #3 Order is newest-first to match the existing v1.3.6 / v1.3.4 entries
- [ ] #4 The website's changelog view and the in-app modal render the new content correctly
<!-- AC:END -->
