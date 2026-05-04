---
id: TASK-99
title: Fix NaN bug in version-checker compareVersions for prerelease tags
status: To Do
assignee: []
created_date: '2026-05-04 09:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/main/version-checker.ts:559-568 splits version strings by dot and applies Number(). When the latest tag has a prerelease suffix (e.g. v1.7.1-rc1), Number('1-rc1') returns NaN, the loop returns NaN, and the gating check 'if (compareVersions(latest, current) <= 0) return idle' fails open because NaN <= 0 is false. Surfaced today when a v1.7.1-rc1 test tag was published with prerelease: false and would have proceeded to download the update on v1.7.0 Windows/Linux installs. Mitigated immediately by marking the rc as prerelease (so /releases/latest no longer returns it) and by hardening the workflow to auto-flag hyphenated tags as prereleases (commit fb5a100). The compareVersions bug remains as a defense-in-depth issue: if anything ever bypasses the prerelease filter, the version comparison should still gate correctly. Use a proper semver comparator (treat 1.7.1-rc1 < 1.7.1) instead of dot-split-Number().
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 compareVersions returns a meaningful negative number when current is stable and latest has a prerelease suffix that is conceptually older (e.g. 1.7.1-rc1 vs 1.7.1)
- [ ] #2 compareVersions returns a meaningful positive number when current is stable older and latest has a prerelease suffix that is conceptually newer (e.g. 1.7.1-rc1 latest vs 1.7.0 current)
- [ ] #3 compareVersions never returns NaN for any well-formed semver tag
- [ ] #4 Unit tests cover prerelease comparisons (rc, beta, alpha) and confirm the version-checker gating works as expected
<!-- AC:END -->
