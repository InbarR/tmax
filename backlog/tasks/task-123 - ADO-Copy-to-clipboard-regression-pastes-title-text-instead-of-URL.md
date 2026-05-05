---
id: TASK-123
title: 'ADO ''Copy to clipboard'' regression: pastes title text instead of URL'
status: Done
assignee:
  - '@claude'
created_date: '2026-05-05 11:33'
updated_date: '2026-05-05 12:41'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-61. User reports that copying a PR title from ADO with the 'Copy to clipboard' button now pastes the plain title instead of the URL, breaking the clickable-link flow.\n\nExample title: 'Pull Request 15621953: Add secondary Kusto clusters and AgentsInventory database for Advanced Hunting'.\n\nThe extractStandaloneLinkFromHtml() check at paste.ts:75 demands stripHtmlVisibleText(html) === stripHtmlVisibleText(inner), which fails if the real ADO HTML has any wrapper content (meta, span, icon glyph, fragment markers, zero-width chars). The e2e test only covers the bare <a href>title</a> shape. Need an HTML dump from ADO to see exactly what's coming through; then either widen the equality (substring with edge anchoring) or normalize more aggressively before comparing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADO PR-title 'Copy to clipboard' pastes the URL, not the title text
- [x] #2 Teams chat / web prose-around-link rich-text paste still pastes visible text (TASK-61 doesn't regress)
- [x] #3 Outlook safelinks paste still unwraps to the real URL (TASK-49/TASK-61 unchanged)
- [x] #4 Add a Playwright spec at tests/e2e/task-123-ado-clipboard-html.spec.ts seeded with the real ADO HTML dump
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect real ADO/IcM HTML from user clipboard dump - confirm trailing prose lives outside the <a> tag
2. Widen extractStandaloneLinkFromHtml: keep strict equality as Case A, add Case B "link at start of visible text + trailing prose begins with separator (`:`, `-`, `|`, etc.)" - matches label:description pattern, leaves "Click here for more" alone (continuation word, not separator)
3. New regression spec at tests/e2e/task-123-ado-clipboard-html.spec.ts: IcM with trailing description, ADO PR title-only link, Teams "Click here" prose, edge case "Read here for more" - should paste prose not URL
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User dumped real IcM HTML: <a href="...">Incident 744762850</a> : Medeina Dev is down. linkInner = "Incident 744762850", visibleText = "Incident 744762850 : Medeina Dev is down" - the trailing " : Medeina..." is a sibling text node after the </a>, not inside it. Strict equality at paste.ts:75 fails, paste falls through to plain text (which has no clickable URL).

This isn't a normalization issue - it's structurally a "label : description" shape which the equality check rejects by design. Fixed by widening to also accept the URL when the link starts the visible text and the trailing chunk begins with a separator (`:`, `-`, `–`, `—`, `|`, `(`, `)`, `/`, `.`, `,`, `;`). Continuation words like " for more" still reject (no leading separator).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restores ADO/IcM "Copy to clipboard" → URL paste flow that TASK-61 inadvertently broke for the label:description shape.

The real HTML for IcM/ADO copies the identifier inside the <a> and leaves the description as a sibling text node (e.g. <a>Incident 12345</a> : Service down). TASK-61 added a strict stripHtmlVisibleText(html) === stripHtmlVisibleText(inner) check to prevent the old code from over-firing on Teams "Click here for more" prose-with-link. The strict check works for HTML that's exactly the link, but rejects label:description.

Fix in src/renderer/utils/paste.ts: keep the strict-equality branch (Case A), and add Case B - extract the URL when (a) the link is at the start of the visible text and (b) the trailing chunk begins with a separator character (`:`, `-`, `–`, `—`, `|`, `(`, `/`, `.`, `,`, `;`). Continuation words (" for more", " please") have no leading separator and still reject, preserving TASK-61's intent.

New regression spec covers four cases: IcM with trailing description (URL), ADO title-only link (URL), Teams "Click here" prose (text), edge case "Read here for more" with continuation word (text).
<!-- SECTION:FINAL_SUMMARY:END -->
