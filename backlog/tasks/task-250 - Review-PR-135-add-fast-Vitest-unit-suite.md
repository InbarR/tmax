---
id: TASK-250
title: 'Review PR #135 - add fast Vitest unit suite'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-20 16:01'
updated_date: '2026-06-21 07:28'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External contributor PR (Meir Blachman). Adds Vitest as the unit runner; npm test runs only tests/unit. Moves pure parser/security/clipboard specs out of Playwright into Vitest, splits fs/git/backlog into tests/integration. +533/-57 across 15 files - largest and most structural of the open PRs; changes the npm test contract. Needs deliberate review before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Test-layout and npm test contract changes reviewed for regressions
- [x] #2 CI green (or failures understood)
- [ ] #3 Merge/decline decision made
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewed locally (checked out PR head).
- Merges cleanly into origin/main (merge-tree: 0 conflicts); GitHub UNKNOWN was just uncomputed.
- Structure solid: 3-tier split, 9 pure specs migrated from Playwright to Vitest, OLD copies removed (no double-run), ZERO src/ product changes.
- Unit suite: 115 tests / 9 files pass in 1.74s (the speed win).
- Integration suite: 1 of 11 FAILS on Windows - backlog-writer.integration.test.ts "verified by the real CLI": backlog task edit ... --ac flags get mangled. Root cause is the test's own Windows cmd.exe quoting helper (joins args into one cmd string); the non-Windows path uses execFileSync(backlog, args) directly and is fine. Installed backlog 1.35.0 DOES support edit --ac, so it is NOT a CLI/product bug - it is a Windows-only test bug (violates repo cross-platform mandate). Fix: pass args as argv array (execFileSync(cmd, [/c, backlog, ...args])) instead of a pre-joined+quoted string.
- Verdict: high-value PR, do not merge as-is (would leave npm run test:integration red on Windows for every contributor).

Fixed the Windows helper (commit 6b55f42) - cmd.exe now receives the command + args as separate argv tokens instead of a hand-quoted joined string. Verified locally on Windows: integration 11/11 green (incl. the real-CLI roundtrip), unit 115/115. Pushed to the fork PR branch (Meir017:add-vitest-unit-suite) via maintainer-modify; CI re-running. Ready to merge once CI re-runs (the pre-existing 36 Playwright failures from TASK-251 remain, but are unrelated and non-blocking).
<!-- SECTION:NOTES:END -->
