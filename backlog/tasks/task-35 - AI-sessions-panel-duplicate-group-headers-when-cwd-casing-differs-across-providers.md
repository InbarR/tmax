---
id: TASK-35
title: >-
  AI sessions panel: duplicate group headers when cwd casing differs across
  providers
status: Done
assignee:
  - '@claude'
created_date: '2026-04-28 10:54'
updated_date: '2026-04-28 11:05'
labels:
  - bug
  - ai-sessions
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User saw two separate 'CLAWPILOT' group headers in the AI sessions sidebar - one with 1 Claude session, another with 28 Copilot sessions. Root cause: CopilotPanel.tsx shortPath() (line 45) returns the last cwd segment as-is. The header is CSS-uppercased so 'ClawPilot' and 'clawpilot' look identical visually but become different Map keys at the bucket step (line 260-265), producing two groups. Reported via screenshot in chat 2026-04-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sessions whose cwds differ only in case (e.g. C:\projects\ClawPilot vs C:\projects\clawpilot) are merged into a single group on Windows
- [x] #2 Group header label preserves original casing of one of the contributing cwds (does not force lowercase in the visible name)
- [x] #3 Tooltip / title attribute on the group header still shows a representative cwd
- [x] #4 macOS/Linux behavior unchanged for case-sensitive filesystems (or matches Windows behavior - decision documented in implementation notes)
- [x] #5 Playwright repro spec lands alongside the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repro test in tests/e2e/ai-sessions-cwd-case-grouping.spec.ts: inject two fixture sessions with cwds C:\__cwdcase__\ProjA and C:\__cwdcase__\proja, open panel with groupByRepo on, assert exactly ONE group header with count badge=2.
2. Fix CopilotPanel.tsx repoKey() to return a lowercase normalized key for grouping. Add repoDisplayName Map computed during the displayList pass that records the original casing from the first session encountered.
3. Update header render: name = repoDisplayName.get(currentRepo) ?? currentRepo. tooltip stays as currentRepo (the normalized key) for stable hover info.
4. Run the new spec + the existing issue-69-group-by-repo spec to confirm no regression.
5. Tick AC #1, #2, #3, #5. AC #4 (mac/linux behavior): document in implementation notes - lowercase normalization is applied uniformly because (a) macOS default APFS is case-insensitive, (b) on case-sensitive Linux FSes a user with cwd /a/Foo and /a/foo would still want them merged in the sidebar UX since they refer to the same project visually.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced via tests/e2e/ai-sessions-cwd-case-grouping.spec.ts (failed pre-fix: 2 groups; passed post-fix: 1 group, count=2).

Fix in CopilotPanel.tsx:
- repoKey() now lowercases for grouping; repoDisplay() preserves casing for the visible label.
- groupDisplayNames Map captures casing of the first session encountered in each lowercase bucket and feeds the header render.
- PINNED_GROUP_KEY (lowercased) used for sort comparisons; PINNED_GROUP retained for display.

Real-world verification: existing issue-69 spec output shows the user's on-disk sessions now render a single "Clawpilot" group (was two). 6/6 related pre-existing specs still pass.

AC #4 decision: lowercase normalization applied uniformly across platforms. Rationale: macOS APFS default is case-insensitive too, and on case-sensitive Linux FSes a user with /a/Foo and /a/foo almost always means the same project visually. The cost of merging two genuinely-distinct case-sensitive folders into one sidebar group is far smaller than the cost of the user-visible duplicate-group bug.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
**TASK-35: AI sessions panel duplicate-group fix**

Sidebar grouped by `shortPath(cwd)` returned as-is, so cwds differing only in case (e.g. `C:\projects\ClawPilot` vs `...awpilot`) became distinct Map keys but rendered as identical-looking "CLAWPILOT" headers - the user saw two groups for the same project.

**Changes**
- `src/renderer/components/CopilotPanel.tsx`: split grouping key (lowercase) from display label (original casing of the first session in the bucket). New `groupDisplayNames` memo feeds the header label and tooltip; sort comparators updated to use the lowercased pinned-group key.

**Tests**
- New: `tests/e2e/ai-sessions-cwd-case-grouping.spec.ts` - inject two fixture sessions with cwds differing only in case, assert exactly one group with count=2.
- Re-ran: `issue-69-group-by-repo`, `session-sidebar-highlight` (all 6 cases) - still green.

**Risk**
- On case-sensitive filesystems (Linux), two genuinely-different folders that share a basename with different casing now collapse into one group. Documented in implementation notes; acceptable trade-off since the basename collision UX was already poor (identical visible labels).
<!-- SECTION:FINAL_SUMMARY:END -->
