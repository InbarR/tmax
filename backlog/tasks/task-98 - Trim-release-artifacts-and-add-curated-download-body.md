---
id: TASK-98
title: Trim release artifacts and add curated download body
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 07:18'
updated_date: '2026-05-04 07:22'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release v1.7.0 shipped 20 assets, most of which are duplicates or auto-update internals that confuse end users (https://github.com/InbarR/tmax/releases/tag/v1.7.0). Cut the redundant electron-forge zips, tighten the upload-artifact globs to avoid the rogue tmax-1.7.0.Setup.exe leaking through, and replace the auto-generated release notes with a curated body listing the right download per platform plus a collapsible <details> block for the Squirrel auto-update files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MakerZIP({}) is removed from forge.config.ts (electron-forge no longer produces tmax-{platform}-{arch}-1.7.0.zip)
- [x] #2 build.yml upload-artifact globs only match the artifacts we want to ship (no rogue Setup.exe, no MakerZIP zips)
- [x] #3 Released asset count drops from 20 to ~12 (excluding source code tarballs)
- [x] #4 Release body shows curated per-platform download links above the asset list
- [x] #5 Squirrel auto-update files (RELEASES-*, *-full.nupkg) are tucked into a collapsible <details> in the body, not deleted from assets
- [x] #6 docs/index.html landing-page download patterns still match the trimmed asset set
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove MakerZIP({}) from forge.config.ts so electron-forge stops producing redundant per-platform zips\n2. Tighten the upload-artifact globs in build.yml so only the renamed Squirrel Setup.exe (per arch), the renamed nupkg, the renamed RELEASES file, the dmg, deb, rpm, and the manually-built portable.zip get uploaded - no more rogue *.exe sneak-throughs\n3. Add a step to build.yml release job that generates release-body.md from a template, interpolating VERSION and the repo download URL\n4. Switch softprops/action-gh-release from generate_release_notes to body_path: release-body.md (keeping generate_release_notes alongside if both render together; otherwise add a Full Changelog link manually)\n5. Verify docs/index.html download regexes still match - especially that the .dmg, Setup.exe, .deb, .rpm, and *-portable.zip remain reachable\n6. Commit; the next tagged release will surface the cleanup
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Removed `MakerZIP({})` from forge.config.ts and dropped @electron-forge/maker-zip from devDependencies
- Tightened upload-artifact globs in build.yml to explicit per-arch Squirrel paths + Windows portable.zip + dmg/deb/rpm; the loose `**/*.exe` glob that let the unrenamed 137MB Setup.exe slip through is gone
- Added .github/release-body.md.template with a curated download table and a collapsible <details> block for the Squirrel auto-update files
- New "Generate release body" step in the release job runs `envsubst` on the template (with VERSION + BASE injected from the tag) then appends GitHub auto-generated PR notes via `gh api .../releases/generate-notes`
- softprops/action-gh-release switched from `generate_release_notes: true` to `body_path: release-body.md`
- Added `actions/checkout@v4` to the release job so the template file is on disk when envsubst runs
- Verified docs/index.html landing-page regexes still match the trimmed asset set (Setup.exe + portable.zip cover Windows; .dmg covers macOS; .deb/.rpm cover Linux)
- tsc --noEmit reports no new errors from the change
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trim GH Release artifacts from 20 to ~12 and replace auto-generated notes with a curated per-platform download body.

## Why

The v1.7.0 release surfaced 20 assets with three Windows installers (one of them a 137MB un-renamed mystery), redundant electron-forge zips on every platform, and Squirrel auto-update files inline with user-facing downloads. New users had to guess which file was theirs.

## Changes

- `forge.config.ts`: removed `MakerZIP({})` (dropped 5 redundant `tmax-{platform}-{arch}-1.7.0.zip` outputs); removed unused import
- `package.json`: dropped `@electron-forge/maker-zip` devDependency
- `.github/workflows/build.yml`:
  - Upload step uses narrow per-arch globs so a stray un-renamed Setup.exe cannot leak into the release; matches the renamed `tmax-{V}-{arch}-Setup.exe`, `tmax-{V}-{arch}-full.nupkg`, `RELEASES-{arch}`, the manually-built `tmax-win32-{arch}-portable.zip`, plus `*.dmg`/`*.deb`/`*.rpm`
  - Release job adds `actions/checkout@v4` and a "Generate release body" step that runs `envsubst` on the template with VERSION + BASE substituted, then appends `gh api .../releases/generate-notes` output for the auto PR list
  - softprops/action-gh-release switched from `generate_release_notes: true` to `body_path: release-body.md`
- `.github/release-body.md.template` (new): curated download table covering Windows installer + portable, macOS dmg per arch, Linux deb/rpm, with the Squirrel auto-update files tucked in a collapsible `<details>` block

## User impact

First-time downloaders see a clear table at the top of each release page: pick your platform, click the link. Squirrel's auto-update infrastructure remains in the asset list (it has to - the in-app updater fetches it by URL) but is de-emphasized.

## Tests

- `npx tsc --noEmit` clean for the forge.config.ts change
- Verified docs/index.html download regexes still match the trimmed asset set: `x64-Setup.exe$|win32-x64.*\.zip$` covers Windows, `arm64\.dmg$` covers macOS, `amd64\.deb$` and `x86_64\.rpm$` cover Linux
- Workflow YAML changes validated structurally; will exercise on the next tagged release

## Risks / follow-ups

- `body_path` plus a manual `gh api` append for PR notes is a two-step substitute for `generate_release_notes: true`. If `gh api` fails (token scope, rate limit) the body still renders, just without the "What's Changed" section - guarded with `|| true`
- The MakerDMG output happens to land at `tmax-{V}-{arch}.dmg`, which the landing page regex matches. If MakerDMG ever changes its naming we'd need to revisit
- Mystery 137MB `tmax-1.7.0.Setup.exe` from v1.7.0 root cause not pinned, but the new narrow upload globs guarantee it cannot reach a future release even if forge produces a stray exe
<!-- SECTION:FINAL_SUMMARY:END -->
