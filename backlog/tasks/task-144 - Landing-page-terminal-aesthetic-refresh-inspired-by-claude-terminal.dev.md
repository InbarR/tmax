---
id: TASK-144
title: 'Landing page: terminal-aesthetic refresh inspired by claude-terminal.dev'
status: Done
assignee:
  - '@inrotem'
created_date: '2026-05-09 16:05'
updated_date: '2026-05-09 16:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tmax's current landing (docs/index.html, served as inbarr.github.io/tmax) is solid but reads as a conventional dark-themed product page. Compare to https://claude-terminal.dev/ which leans hard into terminal aesthetics: monospace section markers ([01], [02]), status-pill labels ([OK], [LIVE], [READY]), terminal-styled CTAs (./INSTALL), system-message hero copy. Goal is to bring tmax's landing closer to that vibe without breaking platform detection, downloads, or screenshots.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hero presents the product as a terminal session (faux prompt + help output), keeps the icon and platform badges
- [x] #2 Section headings use monospace typography with ASCII section markers (e.g. 01, 02 prefix)
- [x] #3 Primary download CTA is restyled as a terminal command (e.g. './download for windows ⏎')
- [x] #4 At least one status pill/badge reinforces the terminal feel (e.g. [stable], [ready])
- [x] #5 All existing functionality still works: platform detection, downloads grid, changelog render, gallery lightbox, contact mailto, GoatCounter clicks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Hero: add a terminal-frame block with prompt and faux 'tmax --help' output showing the tagline and 3-4 key capabilities. Keep icon and badges above it.\n2. Section headings: switch h2 to monospace font (Cascadia Code), prefix each major section with an ASCII numbered marker (▎ 01 / 02 / etc).\n3. Download CTA: restyle as terminal command './download for <OS> ⏎' rendered in the existing button. Keep all dynamic JS-set fields.\n4. Status pill: add a [STABLE] or [READY] badge near hero version pill so the terminal-aesthetic shows above the fold.\n5. Verify: open the file in a browser, check platform detection still fires, primary download still resolves, gallery lightbox opens, changelog renders.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refreshed docs/index.html with a terminal-aesthetic pass inspired by claude-terminal.dev, while keeping all dynamic functionality intact (platform detection, downloads grid, changelog render, gallery lightbox, mailto, GoatCounter clicks).

Changes:
- Topbar: status-bar style with [STABLE] pill and live version readout.
- Sticky navbar: [ TMAX ] brand on the left, path-style links (/uses /download /changelog /features /gallery /community) center, github ↗ on the right. Anchor IDs added to every section with scroll-margin-top so jumps don't get clipped.
- Hero terminal frame: faux mac-window with prompt + typewriter animation - types `tmax --help`, prints the help body line by line, drops to a fresh blinking prompt.
- Logo: replaced the PNG (which had a baked-in dark rectangle background) with an inline SVG of four chevrons fading bright-green → dim-grey, each pulsing on a staggered delay; sits on top of a subtle green-glow sweep behind it.
- Section headers: shell-prompt style (`> tmax uses`, `> tmax install`, `> tmax log`, `> tmax features`, `> tmax demo`, `> tmax contribute`) tying each section to the hero terminal's command motif.
- Bracketed monospace badges: [Windows], [macOS], [Linux], [stars], [version].
- Feature & use-case headings: monospace with green `›` markers.
- Body backdrop: subtle dot-grid pattern with a soft blue radial glow at the top.
- Download CTA: restyled as `> ./download <platform> ⏎` in monospace with a deeper accent gradient.
- Footer: status-line layout with [OPEN SOURCE] pill, MIT license, repo link, build credits, contact.

All animations honor `prefers-reduced-motion: reduce`.
<!-- SECTION:FINAL_SUMMARY:END -->
