---
id: TASK-115
title: Distribute tmax via winget (Windows Package Manager)
status: In Progress
assignee:
  - '@inbar'
created_date: '2026-05-04 20:31'
updated_date: '2026-05-04 20:32'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow Windows users to install tmax with 'winget install tmax' instead of downloading the Setup.exe from GitHub Releases. tmax already ships a Squirrel-based installer (electron-forge maker-squirrel) which winget supports as InstallerType: nullsoft. Two parts: (1) a one-time manifest submission to microsoft/winget-pkgs, and (2) GitHub Actions automation so each new release auto-updates the manifest via wingetcreate. Open questions to settle in the task: PackageIdentifier (likely 'InbarR.tmax' since publisher is the user's GitHub account per the recent README note), whether the installer is signed (winget Community repo tolerates unsigned but submission review prefers signed), and silent install flags Squirrel respects (--silent or --quiet).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PackageIdentifier and Publisher chosen and documented in the task notes
- [ ] #2 Manifest YAML triplet (version + installer + en-US locale) created and validated locally with 'winget validate'
- [ ] #3 Initial PR opened to microsoft/winget-pkgs and accepted
- [ ] #4 GitHub Actions release workflow runs 'wingetcreate update' after each tagged release so the manifest tracks new versions automatically
- [ ] #5 Verified: 'winget install tmax' on a clean Win11 box installs the latest version and 'winget upgrade tmax' moves it forward
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decide identity & answer open questions with user (PackageIdentifier, Publisher metadata, signing status, where to keep manifests in repo).
2. Create initial manifest triplet for current version (1.7.1) under .github/winget/v1.7.1/: Version manifest, Installer manifest (multi-arch x64+arm64, InstallerType nullsoft, silent switches verified), DefaultLocale en-US.
3. Add GitHub Actions workflow that runs after a tagged release publishes - uses vedantmgoyal2009/winget-releaser (or wingetcreate update) to auto-fork microsoft/winget-pkgs and open a PR with the new version manifest. Requires a WINGET_TOKEN repo secret (PAT with public_repo).
4. Document the one-time submission steps in CLAUDE.md or a .github/winget/README.md so the next release knows what to do.
5. User runs winget validate locally on the manifests to confirm they parse.
6. User submits the initial v1.7.1 PR to microsoft/winget-pkgs (forking + PR review is a manual step the bot cannot bootstrap).
7. After acceptance, the next tagged release auto-PRs the new version via the workflow.
8. ACs verified: winget install tmax + winget upgrade tmax on a clean Win11 box.
<!-- SECTION:PLAN:END -->
