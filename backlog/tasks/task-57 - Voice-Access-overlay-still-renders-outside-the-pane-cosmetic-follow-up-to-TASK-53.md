---
id: TASK-57
title: >-
  Voice Access overlay still renders outside the pane (cosmetic follow-up to
  TASK-53)
status: To Do
assignee: []
created_date: '2026-05-01 13:09'
labels:
  - accessibility
  - voice-access
  - cosmetic
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-53 strengthened the UIA hide on the xterm helper textarea, dictated text now commits straight into the prompt without splicing - the data-integrity bug is fixed. However the Voice Access dictation preview overlay still renders adjacent to the right edge of the pane and bleeds outside it. Likely cause: even though the textarea is aria-hidden + tabindex=-1 + aria-readonly + aria-label='', Voice Access still anchors its overlay to the textarea's screen rect because xterm.js positions the textarea at the cursor cell on every render (Terminal.ts:319, CompositionHelper.ts:225-239). Possible fixes to investigate: (a) park the textarea at a fixed offscreen position when not actively composing IME and snap it back during compositionstart, (b) constrain the textarea width to the pane bounds with overflow:hidden, (c) intercept the textarea's getBoundingClientRect via Object.defineProperty to lie about its position to UIA. (a) is most surgical but may break IME caret indicators.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice Access dictation preview overlay either does not render or renders within the visible pane bounds
- [ ] #2 IME composition (CJK input) caret indicator continues to render at the cursor position
- [ ] #3 No regression: TASK-53 data-integrity fix (text commits straight to the prompt) is preserved
<!-- AC:END -->
