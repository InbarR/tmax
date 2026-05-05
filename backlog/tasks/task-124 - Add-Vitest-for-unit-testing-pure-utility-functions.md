---
id: TASK-124
title: Add Vitest for unit testing pure utility functions
status: To Do
assignee: []
created_date: '2026-05-05 12:48'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax has no unit-test framework - all tests run via Playwright e2e against a packaged build (tens of seconds per test, requires npm run package). Pure utility functions like extractStandaloneLinkFromHtml in src/renderer/utils/paste.ts have many interesting input shapes (label:description HTML, prose-with-link, safelinks wrappers, fragment markers, multiple links, empty inputs) that would be ten cheap unit tests instead of three slow e2e specs.\n\nRoot cause TASK-123 surfaced: the TASK-61 e2e spec used the easy shape (HTML = exactly the <a> wrapper) and passed; the realistic ADO/IcM shape with a sibling text node after the </a> was never tested, so the strict-equality regression slipped through. Cheaper unit tests would have made it natural to cover the full input matrix.\n\nScope: add Vitest (or similar - whatever has the smallest config footprint), wire an 'npm test' / 'npm run test:unit' script, migrate src/renderer/utils/paste.ts test coverage to unit tests, leave e2e in place for the user-flow assertions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vitest installed and configured with minimal footprint (config in package.json or one root vitest.config.ts)
- [ ] #2 npm test (or test:unit) runs the suite and exits with non-zero on failure
- [ ] #3 src/renderer/utils/paste.ts has unit-test coverage for extractStandaloneLinkFromHtml across at least: simple <a> wrapper, label:description, prose-with-link, continuation-word edge, multiple links, empty input, safelinks wrap, non-http href
- [ ] #4 CI workflow runs the unit suite alongside e2e (or in place of, where appropriate)
- [ ] #5 Existing Playwright e2e tests still pass and continue to cover end-to-end paste flows
<!-- AC:END -->
