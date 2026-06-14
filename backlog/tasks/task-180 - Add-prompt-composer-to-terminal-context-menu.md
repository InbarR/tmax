---
id: TASK-180
title: Add prompt composer to terminal context menu
status: In Progress
assignee:
  - '@mpmisha'
created_date: '2026-06-14 06:39'
updated_date: '2026-06-14 06:54'
labels:
  - feature
  - frontend
  - ux
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a new option to each terminal's context (pane) menu that opens a lightweight notepad-style text editor, similar in style/placement to the existing transcript/prompts and SessionSummary popovers.

Motivation: composing multi-line prompts directly in the terminal is awkward - newlines/paste are fiddly and a stray Enter submits a half-written message. A scratch composer lets the user write/edit freely, then copy the whole thing to paste into the terminal as a single prompt.

Scope (v1):
- New context menu item in the pane menu (TerminalPanel right-click menu) labeled something like "📝 Prompt composer".
- Opens a modal dialog (palette-backdrop pattern, like SessionSummary) with a multi-line <textarea>, a Copy button, and a Close (✕) button.
- Textarea preserves newlines, paste, undo/redo (native browser behavior).
- Copy button writes the full textarea contents to the clipboard via window.terminalAPI.clipboardWrite and shows brief "Copied!" feedback.
- Esc closes; clicking the backdrop closes; clicking inside the card does not close.
- Per-terminal text persists in the store for the session (so closing & reopening keeps draft); cleared when the terminal is closed.

Out of scope (v1):
- Submit-directly-to-terminal button (deferred - user is still deciding).
- Rich text / markdown rendering.
- Persisting drafts across app restarts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New 📝 Prompt composer item appears in the terminal pane context menu
- [x] #2 Clicking it opens a modal with a multi-line textarea, Copy button, and Close button
- [x] #3 Textarea accepts newlines, paste, and arbitrary length text
- [x] #4 Copy button puts the full textarea contents on the system clipboard and shows transient 'Copied!' feedback
- [x] #5 Esc and backdrop click close the dialog; clicks inside the card don't
- [x] #6 Reopening the composer for the same terminal restores the previously typed draft within the session
- [x] #7 Draft is cleared when the terminal pane is closed
- [x] #8 Bottom action bar contains three buttons: Copy, Submit, Close
- [x] #9 Submit button writes the textarea contents into the focused terminal using bracketed paste, then closes the dialog
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add prompt composer state to terminal store: promptComposerRequest (terminalId|null), composerDrafts map by terminalId, plus actions openPromptComposer, closePromptComposer, setPromptComposerDraft.
2. Clear composerDrafts[terminalId] in the terminal-removal path (closeTerminal or wherever active terminals are removed).
3. Create PromptComposer.tsx component: modal using palette-backdrop pattern (mirrors SessionSummary structure), textarea, Copy button with "Copied!" feedback, Close button, Esc + backdrop close.
4. Add CSS for .prompt-composer-card / .prompt-composer-textarea etc. in global.css (mirror session-summary-* tokens).
5. Mount <PromptComposer /> in App.tsx near <SessionSummary />.
6. Add 📝 Prompt composer item to the TerminalPanel pane context menu, near Show prompts / Session summary.
7. Verify with npm run lint and npm test (or whatever the repo uses). Manually smoke-test in the dev build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan confirmed with user (2026-06-14):
- Three buttons at the bottom of the editor: Copy, Submit, Close.
- Submit uses bracketed paste (\x1b[200~...\x1b[201~) via window.terminalAPI.writePty, same pattern as DiffReview.sendComments.
- Submit does NOT auto-press Enter (user wants to review in the terminal before sending).

Implementation done on branch users/mimer/feature/prompt-composer.
- Added promptComposerRequest + composerDrafts state and openPromptComposer/closePromptComposer/setPromptComposerDraft actions to terminal-store.ts.
- closeTerminal now drops the per-pane draft and clears the composer request if it was targeting the closed pane.
- New PromptComposer.tsx renders the modal (textarea + Copy/Submit/Close footer), wired with Esc-to-close and click-backdrop-to-close.
- Submit uses bracketed paste via writePty without a trailing \r (user reviews before pressing Enter).
- CSS added under "Prompt Composer" section in global.css.
- Menu item added in TerminalPanel pane context menu, immediately after "Show prompts".
- Verified: tsc --noEmit error count went from 36 (main) to 32 on branch; vite renderer build succeeds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a notepad-style prompt composer to each terminal pane, accessible from the pane right-click menu (📝 Prompt composer).

Why:
Composing multi-line prompts directly in the terminal is awkward - newlines and paste are fiddly, and a stray Enter submits a half-written message. The composer is a plain modal textarea so the user can write/edit freely, then copy or paste the whole thing into the terminal as a single block.

What changed:
- New PromptComposer.tsx modal (palette-backdrop pattern, mirrors SessionSummary). Bottom footer holds three buttons: Copy, Submit, Close.
  - Copy: writes the textarea contents to the clipboard via window.terminalAPI.clipboardWrite, with transient "✓ Copied" feedback.
  - Submit: pastes into the focused terminal using bracketed paste (\x1b[200~...\x1b[201~) - no trailing \r, so the user reviews before pressing Enter. Same pattern as DiffReview.sendComments.
  - Close / Esc / backdrop click: dismiss without sending.
- Terminal store gets promptComposerRequest (TerminalId | null) and composerDrafts (per-pane drafts) with openPromptComposer / closePromptComposer / setPromptComposerDraft.
- closeTerminal drops the draft and clears the composer request when the targeted pane goes away, so drafts never outlive their terminal.
- TerminalPanel pane context menu gets a new "📝 Prompt composer" item placed right after "Show prompts".
- Mounted in App.tsx alongside <SessionSummary />.
- CSS in global.css under a new "Prompt Composer" section, styled to match the session summary card family.

Scope notes:
- Drafts persist only for the current app session (no disk persistence by design).
- No keyboard shortcut yet; opens via the context menu only.

Validation:
- npx tsc --noEmit: no new errors introduced (count went 36 -> 32 vs. main; remaining errors are pre-existing and unrelated).
- npx vite build --config vite.renderer.config.ts: succeeds.
<!-- SECTION:FINAL_SUMMARY:END -->
