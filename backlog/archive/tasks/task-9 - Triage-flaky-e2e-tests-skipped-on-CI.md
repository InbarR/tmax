---
id: TASK-9
title: Triage flaky e2e tests skipped on CI
status: Done
assignee: []
created_date: '2026-04-26 10:27'
updated_date: '2026-05-01 15:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two Playwright tests are currently test.skip on CI: oh-my-posh-render (requires oh-my-posh installed locally) and tab-drag-input-freeze (xterm focus is unreliable in headless windows-latest). Investigate whether either can be made to run on CI - the oh-my-posh test could install oh-my-posh in the workflow, the tab-drag test may need an alternative way to verify input reaches the PTY.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Investigate making oh-my-posh-render run on CI by installing oh-my-posh in the workflow
- [ ] #2 Investigate why tab-drag-input-freeze gets only 2 pty writes for an 11-char type() on CI but works locally
- [ ] #3 Either fix and unskip, or document why each must remain skipped in a comment on the test.skip line
- [ ] #4 Update CLAUDE.md / contributing docs if there's any guidance for contributors writing new e2e tests
<!-- AC:END -->
