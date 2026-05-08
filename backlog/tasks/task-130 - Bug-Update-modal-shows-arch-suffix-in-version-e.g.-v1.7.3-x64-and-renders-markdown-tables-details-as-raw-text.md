---
id: TASK-130
title: >-
  Bug: Update modal shows arch suffix in version (e.g. v1.7.3-x64) and renders
  markdown tables/details as raw text
status: Done
assignee:
  - '@copilot-cli'
created_date: '2026-05-05 19:41'
updated_date: '2026-05-05 19:44'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Update Available modal shows two unintended things: (1) The 'latest' version label includes the architecture suffix from Squirrel's update-downloaded releaseName (e.g. 'v1.7.3-x64' instead of 'v1.7.3'). Source: src/main/version-checker.ts line 131 only strips a leading 'v' but not the trailing '-x64'/'-arm64'. (2) Release notes that contain a markdown table (the Download asset table introduced in TASK-98) and a <details><summary> block render as raw '|---|---|' rows and literal '<details>' text - because the home-grown renderMarkdown in StatusBar.tsx neither parses tables nor passes through HTML element tags.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Update modal version label shows 'v1.7.3' (no -x64 / -arm64 suffix) regardless of the running arch
- [ ] #2 Markdown table in release notes renders as a styled HTML table
- [ ] #3 <details>/<summary> blocks render as a collapsible disclosure widget (or at minimum do not show literal angle-bracket text)
- [ ] #4 Existing markdown rendering (headings, bold, links, bullets) unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two surgical fixes for the Update Available modal:

1) src/main/version-checker.ts (Squirrel update-downloaded handler): strip trailing -x64 / -arm64 / -ia32 from releaseName before exposing it as updateInfo.latest. Squirrel's releaseName carries the nupkg id which on arch-split builds is 'tmax-x64' so the version it surfaces was '1.7.3-x64'. Now: '1.7.3'.

2) src/renderer/components/StatusBar.tsx renderMarkdown: added GitHub-style table parsing (header row + |---|---| separator + body rows -> <table><thead>/<tbody>) and a passthrough whitelist for <details>, <summary>, <br>, <hr> so collapsible release-notes sections render as a real disclosure widget instead of literal '<details>' text. Tables and details/summary tags survive the global escapeHtml step via post-escape restoration regexes. Added matching CSS in src/renderer/styles/global.css under .update-modal-notes table and .update-modal-notes details. Verified with a node sanity script that headings, tables, and <details> all produce valid HTML.
<!-- SECTION:NOTES:END -->
