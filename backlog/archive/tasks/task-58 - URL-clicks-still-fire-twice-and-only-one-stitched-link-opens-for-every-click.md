---
id: TASK-58
title: 'URL clicks: still fire twice and only one stitched link opens for every click'
status: Done
assignee: []
created_date: '2026-05-01 13:29'
updated_date: '2026-05-01 14:00'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two URL-click bugs still present after TASK-46/47:

1. Click fires twice - the URL opens in two browser tabs/windows. Likely the original double-open issue (TASK-47) crept back, or a new path bypasses the per-row clip guard.
2. Some URLs hijack every click - example URL https://github.com/enterprises/microsoft/sso?authorization_request=A42LHLZMKTDEHCGMPU3 is the only thing that opens, regardless of which link the user actually clicked. Suggests the link extractor is caching or returning a stale/single-stitched URL across all click targets in the buffer (possibly the SSO authorization redirect from a recent session getting stitched into every subsequent link).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Single click on a URL opens it exactly once
- [ ] #2 Clicking different URLs in the buffer opens each respective URL, not a single cached/stitched one
- [ ] #3 Repro covers the SSO authorization_request URL pattern that originally surfaced the bug
<!-- AC:END -->
