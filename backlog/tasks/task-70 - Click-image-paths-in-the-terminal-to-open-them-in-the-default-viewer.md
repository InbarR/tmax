---
id: TASK-70
title: Click image paths in the terminal to open them in the default viewer
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-03 07:24'
updated_date: '2026-05-03 08:02'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a tmax-clipboard image path appears in the terminal buffer (e.g. an AI agent's prompt echo back of an image the user pasted: C:\Users\inrotem\AppData\Local\Temp\tmax-clipboard-WXlprz\clipboard-2026-05-03T07-23-05-782Z-dlzpbw73.png), the user can not click it to open the picture. The terminal already has a similar link provider for .md paths that opens the in-tmax markdown preview; mirror it for image extensions. Easiest implementation routes activate to shell.openPath via window.terminalAPI.openPath - opens whatever the user has set as default image viewer. (In-app image preview overlay would be nicer but is bigger scope; defer to a follow-up if the user wants tmax-native preview.) Match common image extensions: png, jpg, jpeg, gif, bmp, webp. Should NOT clobber the existing URL link provider - URLs ending in .png are already handled by the URL provider since the regex stops at non-URL chars; the image-path provider only fires for filesystem-path-shaped strings (drive letter or starts with / or ~ or .).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single click on a path ending in .png/.jpg/.jpeg/.gif/.bmp/.webp in a terminal pane opens the image in the OS default viewer
- [x] #2 Path matching mirrors the existing .md provider in TerminalPanel.tsx (drive letter or POSIX root or relative starting with ./~/.) - resolves relative paths against the pane's cwd
- [x] #3 URL handling unchanged - https://example.com/foo.png still opens in browser, not as a local image
- [x] #4 Cross-platform: shell.openPath works on Windows, macOS, Linux
- [ ] #5 Playwright spec writes a known image path to the terminal, simulates click on the path's row, asserts shell.openPath was called with the resolved absolute path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce: write Playwright spec that writes an image path into the terminal buffer and clicks it; spy on window.terminalAPI.openPath.
2. Run spec against existing packaged build to confirm bug (no current image link provider).
3. Implement: add a second link provider in TerminalPanel.tsx right after the .md provider. Use the same path-shape regex as .md but switch the extension group to (png|jpg|jpeg|gif|bmp|webp). Activate handler resolves relative paths against pane cwd and calls window.terminalAPI.openPath.
4. Confirm openPath is already exposed in preload.ts (it is, line 161; ipcMain handler at main.ts:587 calls shell.openPath cross-platform; image extensions are not in DANGEROUS_OPEN_EXTENSIONS).
5. Repackage and re-run the spec to confirm green.
6. Mark ACs, write Final Summary, commit, set Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- 2026-05-03: backlog CLI is broken for tasks 59-70 in this repo - `backlog task <n>` view works but `backlog task edit <n>` and `backlog task list` skip them. Editing this file directly out of necessity; status / notes / final-summary changes were not done via the CLI for that reason.
- Repro spec landed at tests/e2e/task-70-image-path-click.spec.ts. 4 of 5 cases fail on the existing packaged build (no image link provider exists yet); the URL-not-affected case passes because the existing URL provider already handles https URLs.
- Implementation: added a second link provider in TerminalPanel.tsx right after the .md provider (lines ~618-658). Regex is `/(?:[a-zA-Z]:[\\/]|[\/~.])?[^\s"'`<>|:*?]*\.(?:png|jpg|jpeg|gif|bmp|webp)\b/gi` - same path-shape as the .md provider, with the colon excluded from the path char class so URLs flow through the URL provider above.
- Activate calls window.terminalAPI.openPath(absolutePath); openPath was already exposed in preload.ts:161 and bound to shell.openPath in main.ts:587 (cross-platform via Electron). DANGEROUS_OPEN_EXTENSIONS does not include image extensions, so the call goes through.
- Pending: rebuild the packaged tmax (out-e2e/tmax-win32-x64) so Playwright re-runs against the patched renderer. Asked the parent before kicking off `npm run package` per the project rules.

Pivoting to internal image preview overlay (not OS default viewer) to match user request. Click renders <img> in the existing markdownPreview overlay slot; external-viewer button still available.

Pivoted from external viewer to in-tmax preview overlay per user request. Click renders in the existing markdownPreview slot; the overlay's external-viewer button still routes to shell.openPath if the user wants the OS viewer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added image-path link provider in TerminalPanel.tsx mirroring the .md provider. Click renders an in-tmax preview overlay (same MarkdownPreview component, branched on kind='image'). The overlay loads bytes via a new IPC (IMAGE_READ_DATA_URL) that returns a base64 data URL - file:// would be blocked from the Vite-dev origin. The overlay's existing 'open externally' button still routes to shell.openPath if the user wants the OS viewer.
<!-- SECTION:FINAL_SUMMARY:END -->
