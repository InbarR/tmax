---
id: TASK-186
title: Native (no-CLI) write layer for the Backlog board
status: Done
assignee: []
created_date: '2026-06-14 07:26'
updated_date: '2026-06-14 07:36'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most users won't have the backlog CLI installed. The board already reads natively; reimplement writes (status, title, acceptance-criteria toggle, create, archive, init) as direct markdown/file edits in tmax so the board needs no external CLI, Bun, or git. Files must stay format-compatible with backlog.md so the real CLI/web UI can still read them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Status change, title edit, AC check/uncheck, create, archive, and init all work with no backlog CLI on PATH
- [x] #2 Files produced are format-compatible with backlog.md (id allocation, frontmatter, sections) - verified by the real CLI reading them
- [x] #3 Existing board behavior unchanged; e2e covers the native write paths
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the backlog-CLI dependency for writes with a native, pure-TypeScript writer (src/main/backlog-writer.ts). The board now reads AND writes Backlog.md files itself - no backlog CLI, no Bun, no git required.

What changed:
- Native editTask (status/title/AC toggle, touches updated_date, renames file on title change), createTask (id allocation + zero-pad from config.yml, CLI-identical template), archiveTask (move to archive/tasks), initProject (scaffold dirs + config.yml).
- Output is byte-compatible with backlog.md: id TASK-<n> uppercase, filename task-<n> - <slug>.md, YAML titles single-quoted only when required, "- [ ] #N" AC lines, EOL preserved on edits.
- backlog-service.ts now imports the writer; the CLI runner + git-init path were removed.

Why: most users won't have the backlog CLI (it ships a 117MB per-platform Bun binary; bundling was a non-starter). Native writes make the board work for everyone.

Verification: tests/e2e/task-186-native-writes.spec.ts writes with our code and reads back with the REAL backlog CLI - create, AC toggle, status+title edit, archive, and id increment all round-trip correctly. App e2e (add/init, menu, panel) still green.
<!-- SECTION:FINAL_SUMMARY:END -->
