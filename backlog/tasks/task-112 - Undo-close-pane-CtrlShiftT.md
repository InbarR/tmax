---
id: TASK-112
title: Undo close pane (Ctrl+Shift+T)
status: Done
assignee:
  - '@claude'
created_date: '2026-05-04 20:10'
updated_date: '2026-05-04 20:29'
labels:
  - feature
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser-style undo close: pressing Ctrl+Shift+T reopens the most recently closed pane (most recent first, stack-style). Restores shellProfileId, cwd, title, tabColor, and workspaceId. Scrollback NOT restored in v1 (defer until proven needed). Cap the closed-pane stack at 10 entries to bound memory. Reuses Ctrl+Shift+T from the worktree panel - user agreed undo-close is the more frequent action; worktree panel stays accessible via command palette and the StatusBar button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Closing a pane via Ctrl+Shift+W or context menu pushes the pane metadata onto a closed-pane ring buffer (cap 10)
- [x] #2 Pressing Ctrl+Shift+T pops the most recent closed pane and creates a new terminal with the same shell profile, cwd, title, color, and workspace
- [x] #3 Pressing Ctrl+Shift+T with an empty stack is a no-op (does not throw, does not flash)
- [x] #4 Ctrl+Shift+T no longer toggles the worktree panel - worktree panel still reachable from command palette and StatusBar button
- [x] #5 StatusBar worktree button title no longer advertises Ctrl+Shift+T
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add ClosedTerminalEntry type in src/renderer/state/types.ts: { title, customTitle, shellProfileId, cwd, tabColor, workspaceId, closedAt }.
2. In terminal-store.ts: add closedTerminals: ClosedTerminalEntry[] state (cap 10). closeTerminal pushes the entry before deleting. Add restoreClosedTerminal action that pops the most recent entry, creates a new terminal via the same path createTerminal uses, then patches title/customTitle/tabColor/workspaceId post-creation.
3. In useKeybindings.ts: replace Ctrl+Shift+T -> worktreePanel mapping with Ctrl+Shift+T -> restoreClosedTerminal. Add case for restoreClosedTerminal in dispatchAction.
4. In CommandPalette.tsx: add a "Reopen Closed Pane" entry with Ctrl+Shift+T shortcut; remove shortcut from worktreePanel entry.
5. In StatusBar.tsx: remove (Ctrl+Shift+T) from the worktree button title.
6. Type-check, hand off to user for visual verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-04 patch: restore now revives the AI session, not just the cwd. ClosedTerminalEntry gained aiSessionId + aiProvider. closeTerminal looks the session up in copilotSessions / claudeCodeSessions to derive the provider (TerminalInstance does not store it). restoreClosedTerminal calls openCopilotSession / openClaudeCodeSession when both are present, then falls back to bare createTerminal if the session cannot be revived (e.g. it rotated past aiSessionLoadLimit and is no longer in the live list). Identity patch (title, color, workspace) runs in both branches.

2026-05-04 patch 2: workspace restore. Closing a workspace now snapshots all its panes (with AI-session info each) into a single ClosedTerminalEntry of kind=workspace. ClosedTerminalEntry became a discriminated union: { kind: pane, ...ClosedPaneSnapshot } | { kind: workspace, panes: ClosedPaneSnapshot[] }. Ctrl+Shift+T:
- pane: silent restore as before
- workspace: window.confirm() prompts with workspace name + pane count before spawning N PTYs (mitigates accidental Ctrl+Shift+T blowing up the user). Decline = entry stays on the stack so they can retry.
Workspace restore recreates the workspace shell (same id, name, color), switches to it via setActiveWorkspace, then restores each pane through the shared restorePaneFromSnapshot helper.

2026-05-04 patch 3: pane restore now confirms too. Originally pane restore was silent and only workspace restore asked - user wants both confirmed since accidental Ctrl+Shift+T re-spawning a PTY (even just one) is annoying. Pane prompt: Restore pane "<title or cwd>"?
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Browser-style undo close pane on Ctrl+Shift+T.

Changes:
- src/renderer/state/types.ts: new ClosedTerminalEntry type carrying title, customTitle, shellProfileId, cwd, tabColor, workspaceId, closedAt.
- src/renderer/state/terminal-store.ts: closedTerminals: ClosedTerminalEntry[] state (cap 10, oldest evicted from the front). closeTerminal now snapshots the pane identity and pushes to the stack before killing the PTY. New restoreClosedTerminal action pops the most recent entry, calls createTerminal(shellProfileId, cwd), then patches the new pane in the terminals Map with the entry's title/customTitle/tabColor/workspaceId. If the workspaceId no longer exists, falls back to the active workspace.
- src/renderer/hooks/useKeybindings.ts: Ctrl+Shift+T was 'worktreePanel', now 'restoreClosedTerminal'. Added dispatchAction case.
- src/renderer/components/CommandPalette.tsx: added "Reopen Closed Pane" entry with Ctrl+Shift+T shortcut; removed the shortcut from the worktree panel entry (worktree panel still openable via the palette and the StatusBar button).
- src/renderer/components/StatusBar.tsx: worktree button title no longer claims the Ctrl+Shift+T shortcut.

Scope:
- Single-pane restore per keypress (stack pop). Press Ctrl+Shift+T five times to walk back five closures.
- No PTY restoration / scrollback (deliberate v1 scope cut). Title, color, and workspace are restored.
- Empty stack = silent no-op.
<!-- SECTION:FINAL_SUMMARY:END -->
