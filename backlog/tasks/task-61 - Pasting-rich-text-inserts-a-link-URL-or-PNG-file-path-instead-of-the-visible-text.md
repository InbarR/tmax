---
id: TASK-61
title: >-
  Pasting rich text inserts a link URL or PNG file path instead of the visible
  text
status: Done
assignee:
  - '@Inbar'
created_date: '2026-05-02 18:59'
updated_date: '2026-05-02 19:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tmax user reported: when copying rich text (e.g. from Teams chat, web pages) and pasting into tmax, the result is a single link URL or a PNG file path - never the actual visible text. Workaround they've been using: paste into Notepad, copy from Notepad (strips formatting), paste into tmax.

Root cause in src/renderer/components/TerminalPanel.tsx:678-698 (paste handler) and the same logic duplicated in src/renderer/DetachedApp.tsx:

1) Image precedence (line 681): clipboardHasImage() returns true whenever ANY image format is on the clipboard, even when the primary content is rich text containing an emoji/inline image. tmax then saves a PNG and pastes the file path, never reading the text format.

2) Link extraction precedence (line 687-688): extractLinkFromHtml(html) returns the first <a href> if HTML contains exactly one link. The expression `linkUrl || clipboardRead()` then prefers the URL over the plain text. Any rich-text copy with a single hyperlink (e.g. "Click here" with "here" linked) ends up pasting just the URL.

The comment on extractLinkFromHtml explains the original intent: unwrap ADO "Copy to clipboard" / Outlook safelinks where the clipboard literally is just a link. The heuristic is too loose - it should only fire when the HTML's visible text equals (or is empty / matches) the link URL itself, not when there's real prose around the link.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pasting rich text from Teams/web/email that contains a hyperlink AND surrounding text inserts the visible text (with the link as text), not just the URL
- [x] #2 Pasting rich text that contains an embedded inline image BUT primary content is text inserts the text, not the saved PNG file path
- [x] #3 ADO/Outlook 'Copy link' (HTML clipboard is JUST a single link with no other prose) still unwraps to the bare URL - existing behavior preserved
- [x] #4 Pasting a copied image (image-only clipboard, no text) still saves the PNG and pastes the file path - existing behavior preserved
- [x] #5 Same fix applied to both TerminalPanel.tsx and DetachedApp.tsx (logic is duplicated across the two paste sites)
- [x] #6 Playwright spec covers: rich-text-with-link, rich-text-with-inline-image, link-only-html, image-only-clipboard, plain-text
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce with Playwright FIRST (per saved feedback: every tmax bug repros first, then fix, then ship test alongside).
   - New spec tests/e2e/task-61-rich-text-paste.spec.ts.
   - Seed the clipboard via app.evaluate({clipboard}) using main-process Electron clipboard API (writeBuffer for HTML, writeImage for images, writeText for plain).
   - Cases:
     a) Rich text with one link AND surrounding prose ("Hey check <a>this page</a> please") -> expect plain prose pasted, not the URL.
     b) HTML that is JUST a link wrapper ("<a href=...>PR Title</a>", ADO/Outlook style) -> expect the URL (existing behavior preserved).
     c) Clipboard has BOTH image and text -> expect text.
     d) Image-only clipboard (no text) -> expect saved PNG path (existing behavior preserved).
     e) Plain text URL with safelinks wrapper -> expect unwrapped URL (existing behavior preserved).
     f) Plain text (no HTML) -> expect plain text.
   - All "rich text with link AND prose" + "image with text" assertions FAIL pre-fix, prove the bug.

2. Fix the precedence in shared logic. Two changes:
   a) Replace "extractLinkFromHtml" matches.length === 1 heuristic with a visible-text comparison: only treat HTML as a "Copy link" when the documents stripped visible text equals the links inner stripped text (= no surrounding prose). Rich text with prose + link falls through to plain text.
   b) Image precedence: only treat clipboard as image when no plain text is also present. Clipboard with both -> prefer text (Teams emoji-in-prose case).

3. Apply fix to the 4 call sites (logic is duplicated):
   - TerminalPanel.tsx Ctrl+V paste (lines 678-698)
   - TerminalPanel.tsx right-click paste (lines 1312-1337)
   - DetachedApp.tsx Ctrl+V paste (lines 108-130)
   - DetachedApp.tsx right-click paste (lines 175-197)
   To avoid drift extract a small helper resolveClipboardPaste(): { kind: image } | { kind: text, text } | { kind: none }. Drop into a renderer-side util module so all 4 sites call the same logic. The refactor stays narrow - just the precedence resolution, not the surrounding paste plumbing.

4. Run the new spec to verify the previously-failing assertions now pass; existing paste/copy specs still pass.

5. Commit, mark task Done with final summary.

Open question for you: should the refactor in step 3 introduce the shared helper module, or do you want me to fix in place 4x and leave the duplication for now? My lean is the helper - the duplication is real and the new logic is non-trivial so drift risk is high.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added src/renderer/utils/paste.ts: `unwrapSafelinks`, `extractStandaloneLinkFromHtml`, and `resolveClipboardPaste({ hasImage, html, plainText })` returning a discriminated `{ kind: image | text | none }`.
- Replaced the 4 inline paste blocks (TerminalPanel Ctrl+V, TerminalPanel right-click, DetachedApp Ctrl+V, DetachedApp right-click) with a single `resolveClipboardPaste` call. Removed local copies of `unwrapSafelinks` / `extractLinkFromHtml` from both files.
- New heuristic for "this HTML is a Copy-link, not rich-text-with-a-link": strip all tags from the document, strip all tags from the matched `<a>` inner text, and only return the URL when the two visible-text values are equal (or the visible text equals the URL). ADO PR copy + Outlook safelinks pass this test; Teams/web rich text with prose around a link does not.
- Image now only wins when no plain text is present on the clipboard.
- DetachedApp Ctrl+V used to read plain text via async `navigator.clipboard.readText()`; switched to the synchronous `window.terminalAPI.clipboardRead()` so all 4 sites take the same code path.
- Test file: tests/e2e/task-61-rich-text-paste.spec.ts covers the 5 scenarios (rich-text-with-link, ADO-style-link-only-HTML, image+text, image-only, plain-text).
- Manual verification path: paste a Teams message that contains a hyperlink into a tmax pane in dev mode, expect the visible prose, not the URL.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed rich-text paste in tmax over-firing on link-extraction and image-precedence heuristics, which made any Teams chat / web copy with a hyperlink paste as just the URL, and any clipboard content with an inline image (Teams emoji, embedded screenshot) paste as a saved PNG file path. Both behaviors made tmax unusable for normal rich-text paste; users were forced to round-trip through Notepad to strip formatting.

Changes:
- New helper `resolveClipboardPaste({ hasImage, html, plainText })` in src/renderer/utils/paste.ts returns a `{ kind: image | text | none }` decision. Two precedence rules:
  - Image only wins when no plain text is on the clipboard. Clipboard with both -> prefer text.
  - HTML-as-URL only wins when the documents stripped visible text equals the matched links inner stripped text - i.e. the HTML is a `<a>` wrapper with no surrounding prose (ADO PR title, Outlook safelinks). Rich text with prose around a link falls through to plain text.
- Replaced 4 duplicated paste blocks with calls to the helper:
  - TerminalPanel.tsx Ctrl+V
  - TerminalPanel.tsx right-click
  - DetachedApp.tsx Ctrl+V
  - DetachedApp.tsx right-click
- Removed local `unwrapSafelinks` / `extractLinkFromHtml` from both component files (now exported from utils/paste.ts).
- DetachedApp Ctrl+V switched from async `navigator.clipboard.readText()` to the synchronous preload `clipboardRead()` so all 4 paste sites take the same code path.

Tests:
- New Playwright spec tests/e2e/task-61-rich-text-paste.spec.ts covers 5 scenarios (rich-text-with-link, ADO-style-link-only-HTML, image+text, image-only, plain-text). Pre-fix the rich-text-with-link and image+text cases fail; post-fix all five pass.

User impact: pasting from Teams chat, web pages, and emails now inserts the visible text. ADO "Copy to clipboard" / Outlook safelinks behavior preserved (still unwraps to bare URL). Image-only clipboard behavior preserved (still saves and pastes file path).
<!-- SECTION:FINAL_SUMMARY:END -->
