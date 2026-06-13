---
id: TASK-152
title: AI session bar doesn't appear for cop --resume / --continue sessions
status: To Do
assignee: []
created_date: '2026-06-06 15:41'
updated_date: '2026-06-06 15:56'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a Copilot session is started via 'cop --resume', tmax often fails to auto-link the pane to the AI session, so the per-pane AI bar (last-prompt banner, transcript button, F5-continue, status dot) never appears even after sending a prompt. Diagnosed live 2026-06-06: the resumed session (e.g. 6f853dee, cwd C:\projects) became active (status thinking, messageCount 1) but the cwd-match auto-link path in terminal-store.ts updateTerminalTitleFromSession() found ZERO eligible panes (confirmed: ai-link-bridge-check fired, which only runs when candidateId is still null after the cwd path). Four panes shared cwd C:\projects (backlog/agency/dox/workiq) yet none matched. The bridge fallback also fails because it needs messageCount<=2 AND a process-tree stamp, but stampedPanes was 0. Determine why the cwd path rejected all same-cwd panes (mode gate? runtime t.cwd drift? multiple-same-cwd ambiguity) and make resume reliably link. Reproduce with Playwright first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane running 'cop --resume' that becomes active in a known cwd gets its AI session bar shown
- [ ] #2 Auto-link succeeds when one or more panes share the session cwd, picking the focused/most-likely pane
- [ ] #3 Playwright e2e reproduces the resume-link failure and passes after the fix
- [ ] #4 No regression: a freshly-opened non-AI shell in a shared cwd is NOT poached by an old active session
- [ ] #5 Mode A fixed: a --continue/--resume session that re-activates an evicted/unloaded session is surfaced to the renderer
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live diag 2026-06-06 - confirmed TWO failure modes, both end in no AI bar:

Mode A (session never surfaced): cop --continue created session b4c6cb9f (C:\projects, Backlog-HQ). It has ZERO mentions in the renderer diag log - no ai-link-call ever fired, so the main-process Copilot monitor never emitted session-added/updated to the renderer. Suspect refreshSession() only fires onSessionUpdated when oldSession exists in memory; an evicted/never-loaded session that gets re-activated by --continue reloads with oldSession=undefined and is silently dropped (copilot-session-monitor.ts).

Mode B (surfaced but cwd-link finds zero panes): session b44c24f2 (C:\projects, msgCount 3, thinking) DID reach the renderer but the cwd auto-link found zero eligible panes (candidateId null -> bridge ran, stampedPanes 0). Same as the resume cwd-match failure. Multiple panes share C:\projects yet none matched - need the new renderer:ai-link-no-eligible diag (added this session) to see whether it is a mode gate, runtime t.cwd drift, or existing-link rejection.

Also seen: Copilot prints "IDE auto-connect skipped: session is already in use by another client" on --continue (prior inuse.<pid>.lock held), which correlates with these.

Instrumentation added (renderer): terminal-store.ts logs renderer:ai-link-no-eligible with each pane cwd/normCwd/cwdMatch/mode/aiSessionId when the cwd path rejects all panes. Next reproduction will pinpoint Mode B.
<!-- SECTION:NOTES:END -->
