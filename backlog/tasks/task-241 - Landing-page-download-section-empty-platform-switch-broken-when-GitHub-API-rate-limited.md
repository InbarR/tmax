---
id: TASK-241
title: >-
  Landing page download section empty / platform switch broken when GitHub API
  rate-limited
status: Done
assignee: []
created_date: '2026-06-15 09:45'
updated_date: '2026-06-15 09:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On inbarr.github.io/tmax the Download card degraded badly: clicking the macOS/Linux hero badges only scrolled and still showed the detected (Windows) build, and 'Other platforms' was empty - leaving no way to reach non-detected builds. Root cause: the card depended entirely on the unauthenticated GitHub releases API (60 req/hr per IP), which users behind a shared corporate NAT exhaust; on failure the catch left the card bare (stale version, empty grid). Fix in docs/index.html: same-origin fallback to download-history.json (latest tag + asset names -> reconstructed releases/download URLs, verified 200), and wired the hero badges to re-render the card for the chosen platform. Refactored loadRelease into fetchAssets() + renderDownloadCard().
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Download card populates (version, primary, other platforms) even when the GitHub API is rate-limited
- [x] #2 Clicking a hero platform badge switches the primary download to that platform
- [x] #3 Constructed fallback download URLs resolve (verified HTTP 200)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in fba9481 (branch fix/landing-download-resilience). docs/index.html now falls back to the committed download-history.json when the GitHub releases API is rate-limited, so the version, primary download, and Other platforms list always populate; the hero Windows/macOS/Linux badges now re-render the card for the selected platform. Verified fallback asset resolution per platform and that constructed releases/download/<tag>/<asset> URLs return 200.
<!-- SECTION:FINAL_SUMMARY:END -->
