---
id: TASK-78
title: 'Per-pane action: Move to workspace X'
status: Done
assignee:
  - '@claude-agent'
created_date: '2026-05-03 12:57'
updated_date: '2026-05-03 14:53'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today, panes belong to whichever workspace was active when they were created. There is no quick way to relocate an existing pane into a different workspace - the user has to recreate the pane in the target workspace. Want a per-pane action 'Move to workspace ...' that lists existing workspaces (and optionally 'New workspace') so the user can re-home a pane in one click. Surface should match other per-pane actions (overflow menu / right-click on title bar / Command Palette). Open: should the moved pane keep its layout slot in the destination, or land in a default position? What happens when moving the last pane out of a workspace - leave the workspace empty, or auto-remove it?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Per-pane overflow menu has a 'Move to workspace' submenu listing all existing workspaces
- [x] #2 Selecting a destination workspace removes the pane from the current workspace and adds it to the destination
- [x] #3 Pane process / cwd / scrollback survive the move (no PTY restart)
- [x] #4 Command Palette has an equivalent 'Move pane to workspace …' command for the focused pane
- [x] #5 Cross-platform: works the same on Windows/macOS/Linux
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add movePaneToWorkspace(terminalId, destWorkspaceId) action to terminal-store: snapshot active layout into workspaces map, mutate src+dest workspace.layout.tilingRoot via removeLeaf/insertLeaf, update terminal.workspaceId, switch active workspace if the moved pane was focused. PTY untouched.
2. Wire submenu in TerminalPanel.tsx overflow menu: a "Move to workspace" item that on hover/click reveals a sub-list of workspaces (skipping current). Use existing .context-menu styling.
3. Add Command Palette commands per workspace: "Move pane to workspace: <name>" guarded on focused pane existing AND (workspaces.size >= 2) AND destination != current pane workspace.
4. Tested via npx tsc --noEmit (must stay at 37 lines). Add a follow-up Playwright spec note in notes (do not run e2e).
5. Mark ACs, write final summary, commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added movePaneToWorkspace(terminalId, destWorkspaceId) in terminal-store.ts. Snapshots the live top-level layout into the source workspace, removeLeaf from source.tilingRoot, insertLeaf to right of last leaf in dest.tilingRoot, updates terminal.workspaceId. PTY untouched - just in-memory state.
- TerminalPanel.tsx overflow menu got a "Move to workspace" submenu (gated on workspaces.size > 1). Submenu lists all workspaces except the pane's current one and shows the workspace color dot when set; tags the active workspace with "(active)" hint.
- CommandPalette.tsx generates one "Move pane to workspace: <name>" command per non-current workspace, gated on a focused pane and workspaces.size >= 2.
- If the moved pane was focused, activeWorkspaceId switches to the destination so the user follows their pane. Otherwise we stay in place.
- TS check stayed at the pre-existing 37-line baseline. Renderer build via vite is clean.
- Wrote tests/e2e/workspaces-move-pane.spec.ts (4 scenarios: follow-when-focused, stay-when-not-focused, submenu visibility gating, palette entry). Per parent, e2e suite NOT executed in this worktree.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Per-pane "Move to workspace ..." action that re-homes an existing pane into a different workspace without recreating it. Surfaced in the per-pane overflow menu and the Command Palette, matching the existing TASK-40 workspaces feature.

What changed
- New store action: movePaneToWorkspace(terminalId, destWorkspaceId) in src/renderer/state/terminal-store.ts. Snapshots the live top-level `layout` into the source workspace map entry (so we mutate a canonical, up-to-date tree), then removeLeaf from the source workspace's tilingRoot and insertLeaf to the right of the last leaf in the destination's tilingRoot - same heuristic createTerminal uses for "where does a fresh pane land?". Updates terminal.workspaceId so reconcileGridLayout / save / future workspace switches all agree on the new home. If the moved pane was focused, activeWorkspaceId switches to the destination so the user follows their pane; otherwise the active view is left alone (only the underlying workspaces map mutates).
- Per-pane overflow menu in src/renderer/components/TerminalPanel.tsx: new "Move to workspace ▸" entry, gated on workspaces.size > 1 (no-op when only one workspace exists). Clicking it opens a sibling submenu listing every workspace except the pane's current one, with the workspace color dot rendered next to the name. Backdrop click closes both the parent menu and the submenu in one step.
- Command Palette in src/renderer/components/CommandPalette.tsx: generates one "Move pane to workspace: <name>" entry per non-current workspace, gated on a focused pane existing and workspaces.size >= 2. Hidden entirely when the gates fail, so the palette stays clean for users who never use workspaces.

User impact
- The PTY keeps running through the move - cwd, scrollback, and any in-flight process all survive. No re-spawn, no shell init, no re-attach.
- Single-workspace flow is untouched. Both surfaces are conditionally rendered, so users without workspaces never see them.

Cross-platform
- Pure state mutation - no platform-specific code. No new keyboard shortcut introduced (none required by the ACs), so isMac vs ctrlKey is moot here.

Tests
- npx tsc --noEmit: held at the pre-existing 37-line baseline (no new TS errors introduced).
- npx vite build: clean.
- New e2e spec tests/e2e/workspaces-move-pane.spec.ts covers four scenarios: follow-when-focused, stay-when-not-focused, submenu gating (1 vs 2+ workspaces), and palette entry generation. Per parent direction the suite was NOT executed in this worktree.

Files
- src/renderer/state/terminal-store.ts (action + interface)
- src/renderer/components/TerminalPanel.tsx (overflow submenu)
- src/renderer/components/CommandPalette.tsx (palette commands)
- tests/e2e/workspaces-move-pane.spec.ts (new spec)

Risks / follow-ups
- Floating panes are skipped (mode !== 'tiled' is a no-op). Today there's no UI path to invoke the action on a floating pane (the overflow menu shows "Restore to grid" instead), but if a future float-aware UI is added we'll want to teach this action to also re-home floatingPanels[].
- Move-to-workspace does NOT preserve the pane's exact split slot in the source (e.g. "left half" stays with the surviving sibling). Pane lands at the right of the destination, matching createTerminal's default.
<!-- SECTION:FINAL_SUMMARY:END -->
