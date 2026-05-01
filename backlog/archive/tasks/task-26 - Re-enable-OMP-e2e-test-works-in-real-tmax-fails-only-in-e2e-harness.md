---
id: TASK-26
title: 'Re-enable OMP e2e test (works in real tmax, fails only in e2e harness)'
status: Done
assignee: []
created_date: '2026-04-26 15:43'
updated_date: '2026-05-01 13:22'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User visually verified that oh-my-posh renders correctly in regular npm-start tmax sessions on Windows: full theme - identity segment (inrotem), folder, git, python, runtime - all show. The e2e test tests/e2e/oh-my-posh-render.spec.ts deterministically fails because the test harness (fresh user-data-dir, offscreen window, TMAX_E2E=1) prevents pwsh profile from loading OMP. Skipped via test.skip(true, ...) for v1.6.0. Investigate root cause in the e2e env and re-enable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 oh-my-posh prompt renders inside tmax pwsh sessions on Windows
- [ ] #2 tests/e2e/oh-my-posh-render.spec.ts no longer skipped
- [ ] #3 OSC 7 cwd reporting (the original purpose of the integration) still works
- [ ] #4 Identify why pwsh profile doesn't load OMP in TMAX_E2E mode
- [ ] #5 Remove the test.skip(true, ...) once root cause is fixed
- [ ] #6 Test passes in full e2e suite
<!-- AC:END -->
