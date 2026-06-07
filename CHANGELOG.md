# Changelog

## v1.10.0

A brand-new AI session transcript, a "restore last session" option, and stability fixes for long-running sessions.

### New Features

- **AI session transcript panel** - a docked, read-only chat view of any Copilot or Claude Code session. It shows both sides of the conversation - your prompts and the agent's replies - with timestamps grouped by day, follows the focused pane, and live-updates as the agent works. Open it with `Ctrl+Alt+T` or the 💬 button on an AI pane.
- **Search the transcript** - press `Ctrl+F` in the transcript to find text and jump between matches.
- **Resizable transcript** - drag the panel's edge to resize it; your width is remembered between sessions.
- **Open any session's transcript** - right-click a session in the AI Sessions panel and choose Transcript to read it, even when it isn't open in a pane.
- **Restore previous session on launch** - a new setting to automatically reopen your last set of terminals when tmax starts.

### Fixes

- **No more slowdown over time** - fixed memory that grew during very long-running sessions and could eventually freeze the app.
- **Cursor stays visible in AI tools** - the text cursor no longer disappears in Copilot CLI / Claude Code panes when the pane isn't focused.
- **Top of the window no longer clipped** - fixed a case where the top edge of the UI could be cut off.
- **Reliable text selection in the transcript** - selecting and copying text from messages now works consistently.
- **Stats page chart** - fixed a blank chart when combining Week view with the per-interval option.

## v1.9.3

A quick stability patch for terminal panes running AI tools.

### Fixes

- **Smoother AI assistant panes** - fixed a glitch that could scramble the display or stop the mouse from working in Copilot CLI and Claude Code panes. They now render cleanly and respond as expected.

## v1.9.2

Signed Windows builds, plus a batch of scrolling and AI-pane fixes that landed since v1.9.1.

### New Features

- **Signed Windows builds** - tmax installers and binaries are now code-signed via Azure Trusted Signing, so Windows no longer throws SmartScreen / "unknown publisher" warnings when you download and install.
- **Reload button in the file preview** - re-read the current file from disk without closing the preview. Works for Markdown and other text files, whether opened from a terminal link, the Copilot panel, or the File Explorer.
- **One toggle for close buttons** - "Hide tab close buttons" now also hides the ✕ on workspace tabs, so a single setting covers both.

### Fixes

- **Wheel and scrollbar now scroll Copilot CLI / Claude Code panes** - alt-screen TUIs using legacy mouse encoding had their wheel and drag reports silently dropped (and it broke after a split). tmax now forwards them, so scrolling works again - including dragging the scrollbar gutter to scroll the TUI's own buffer.
- **Scrollbar drag scrolls the terminal buffer** - dragging the scrollbar thumb now moves the buffer even inside focus mode, floating panels, and the workspace grid, where xterm previously ignored the drag.
- **Settings → Appearance no longer freezes** - the font picker enumerated every installed system font synchronously when the tab opened, freezing the window; it's now chunked and cached.
- **Prompt search is fast and consistent** - typing no longer lags with many AI sessions loaded, and the results list no longer leaves stale rows on screen under a "0 results" count.

## v1.9.1

A mid-week patch focused on AI-pane recovery, smarter pane titles, and the long-tail polish that landed since v1.9.0.

### New Features

- **Hover an AI pane's title (or its tab)** for a rich session summary - opener, workspace / branch, message count, last-active time, and current status. Same content as the Session Summary popup, just on hover, no click needed.
- **`firstPrompt` is now captured for Copilot sessions** (it was already there for Claude Code), giving every AI session a stable "what was this about?" line independent of Copilot's churning `summary` field.
- **Auto-reset mouse mode when an AI CLI exits a pane** - no more dropping to a shell with dead wheel + drag-select after Copilot CLI or Claude Code quits. The pane recovers silently within ~10 seconds.
- **"Reset Mouse Mode" Command Palette action** - manual escape hatch for the same recovery, available any time even while a TUI is still alive.
- **Tab color UX refresh** - 16-color palette (Pink / Indigo / Brown / Lime / Black / White added), a "Change pane color" picker in the pane overflow menu, a Tab color intensity slider in Settings, and true-black panes at intensity 100.
- **Window restores on the display under your cursor** when launched off-primary - no more popping over to the primary monitor on every taskbar / shortcut launch.
- **Centralised `getEffectiveCwd()`** so the diff panel and other CWD-sensitive surfaces consistently fall back to the shell's CWD once an AI session goes idle (PR #114, thanks @yoziv!).

### Bug Fixes

- **`.md` preview links work again when an Ink TUI hard-wraps a no-space path** - we retry with a seam-stripped variant when the first read returns null, so paths like `…/OneDrive - Microsoft\…` and `…/fi les/…` both resolve (PR #119, thanks @mpmisha!).
- **macOS pane stops going dead after a new tab opens** (#115) - stuck dnd-kit drag overlays cleared via global `pointercancel` / window-blur / visibility-change listeners, and the drop zones default to `pointer-events: none` so a stuck flag at worst means "no drop targets briefly," never "the pane is dead."
- **Mouse wheel works again in Claude Code / Copilot CLI panes** - Ink-based TUIs own the viewport (baseY===0 with mouse tracking on), so the wheel handler now lets xterm forward wheel reports to the TUI's own scroller instead of swallowing them.
- **AI session status no longer sticks** on `executingTool` (Copilot) or `waitingForUser` (Claude Code) when turns end with pending tools or when progress events arrive after `end_turn` (#118). Adds a 30s staleness fallback for Copilot mirroring the Claude parser.
- **Pane title latches on the session's opening ask** - no more rewriting to whatever the user just typed. Copilot's `row.summary` churns on every turn; the latch holds the first prompt until the user renames or relinks.
- **`Ctrl+Shift+W` closes every selected pane** when multiple panes are selected (was only closing the focused one).
- **"Show All" in workspaces mode widens the grid to every tiled pane** instead of dropping back to focus mode on one pane.
- **`~` in Default Start Folder expands to homedir** on Mac/Linux (and `~\` on Windows). Settings placeholder is now platform-aware.
- **zsh prompt themes that use `chpwd` hooks** (oh-my-zsh, p10k variants) render their cwd segment on the first prompt when tmax spawns directly into a folder.
- **Smart-copy keeps code-block lines separate** when the source has a container indent - no more 10-line code blocks collapsing into one giant line on paste.

### Polish

- **`TERM_PROGRAM=vscode`** so Ink-based AI CLIs switch to their non-Ink renderer where available - real scrollback through long AI sessions on Windows.
- **Default scrollback bumped from 5,000 to 50,000 lines** with a one-shot migration that preserves explicit user overrides. Memory cost stays lazy and small for quiet panes.
- **Always-visible terminal scrollbar** so the drag handle is there even when a TUI is intercepting the wheel.
- **`windowsPty.buildNumber`** is now passed to xterm.js so modern Windows builds (>= 21376) get the full reflow path on resize.

## v1.9.0

A Sunday release focused on AI session quality-of-life and a big watcher-CPU win. Cross-instance state syncs now work properly, notifications got cleaner, and idle CPU drops from 4-6% to about 1%.

### New Features

- **Per-group "+ new session" button** in the AI Sessions panel - each repo group header has a + button that spawns a fresh Copilot session in that group's cwd (#105, thanks @AsafMah!).
- **`Ctrl+Alt+R` refresh pane** - tears down and restarts the focused pane's PTY in place, preserving the title and cwd (#101, thanks @ofek01001!).
- **`Ctrl+Insert` copies the selection** - third alias for Copy alongside `Ctrl+Shift+C` and the right-click menu (#102, thanks @dmitrykunn!).
- **Drag-and-drop a file onto a terminal** writes the path into the prompt; multi-select dropping joins paths with spaces.
- **Floating "jump to bottom" button** appears when you've scrolled up in any pane; click to snap back to the live tail.
- **Wake / ping button per AI session** - a small icon in each session row writes a no-op so dormant sessions refresh their status.
- **Sort menu radio rows + most-prompts sort** - the AI sessions sort menu now uses clean radio rows for Title / Activity / Prompts. Sorting by prompts is hidden when groups are visible since the group count shown is sessions-not-prompts and the ordering looked unrelated.
- **Notification exclude list** - Settings → Notifications lets you maintain a list of strings; any AI notification whose title or body matches is silenced. Useful for users running an external hook in parallel.
- **Auto-attach diagnostic log tail to Report-an-issue** - the GitHub issue body comes prefilled with the last ~25 KB of `tmax-diag.log` as a collapsible `<details>` block so we have repro context.
- **Session list label disambiguation** - if multiple cwds end in the same leaf folder name (e.g. two folders both named `tmax`), labels expand to the shortest unique parent path.

### Performance

- **Idle CPU dropped from 4-6% to ~1%** - replaced the full-glob `usePolling: true` watchers with a three-tier strategy: native chokidar on the parent dir + 1s mtime poll over a 5-minute hot set + 10s stale sweep. WSL paths keep the old polling behavior since native watching is unreliable over `wsl.localhost` shares.
- **AI session row memoization** - per-row component is `React.memo` with identity-stable props, so a single session update no longer re-renders the entire list. Cuts "Not Responding" pauses on busy 1500+ session boards.

### Bug Fixes

- **AI session rename is consistent across sidebar / tab title / Copilot `/rename`** - PR #106 (thanks @yoziv!) stitches all three together: workspace.yaml watcher routes the rename, the renderer's name override beats the linked terminal's customTitle, and a regression guard catches the prior TASK-88 issue.
- **Cross-instance session state actually syncs** - when two tmax windows share the same userData (dev + packaged), changes in one would appear stale in the other because the cached session file wasn't being re-read on disk-change events. `SESSION_LOAD` now does a fresh disk read every call, so archives, renames, and pins propagate.
- **Auto-link no longer poaches stale sessions** - opening a fresh AI pane in a folder with a long-running session used to steal the old session's title and last prompt. Auto-link now refuses sessions older than 30s when the new pane has process-tree-detected its own fresh AI.
- **Group-by-repo toggle works regardless of sort mode** - the toggle was silently ignored when sorting by time. Now triggers a layout rebuild on every click.
- **Escape key reaches the PTY in TUI apps** - a renderer keybinding was eating Escape before it reached your terminal. Now scoped to fire only when the prompt search dialog is open (#103, thanks @AsafMah!).
- **No more notification flood at launch** - after the watcher rewrite, the initial scan was firing notifications for every active session at startup. Suppressed.
- **Archived sessions stay archived across restarts** - the lifecycle override map wasn't applied on the SQLite-loaded fast path, so archived sessions reappeared as Active. Fixed.
- **Cleanup low-prompt sessions persists across restarts** - the bulk archive was only updating memory; now writes through to disk.
- **Title updates for wrapper-launched AI** - if you launched Copilot or Claude Code via an alias or wrapper script, the process-tree walker stopped at the wrapper's name. It now descends one more level (#99, #85, thanks @ronny8360988!).
- **Settings → Shells "Add Shell" button works again** - the button was a no-op (#104, thanks @AsafMah!).
- **Report an issue "Open GitHub" works again** - regressed when the diag-log auto-attach landed.
- **"Show in AI sessions" highlight is now distinguishable from a click-selected row** - added a separate highlight style for the jump-to source.
- **AI session search filter** - prefix matching now finds partial words like `add AND refr` → `refresh`.

### Polish

- **Cleaner notification titles** - removed special-case branding from notification titles. All notifications now use the underlying provider label (Copilot / Claude Code). Internal markers in the body are still scrubbed via `stripClawpilotContext`; just no branded title.
- **Cross-session notification dedup** - wrappers that spawn two distinct sessions per turn (a Copilot + Claude Code pair) used to fire two identical notifications. An 8-second body-dedup window now collapses the duplicate.
- **"DEV" pill in notification title** for dev builds, so you can tell which build surfaced the toast.

## v1.8.0

A feature-heavy release. Headline additions: 12 theme presets, an AND-syntax across every filter box, a per-pane attention shimmer for waiting AI sessions, drag-reorderable workspace tabs, and SQLite-backed Copilot session loading for a much faster startup.

### New Features

- **12 theme presets in Settings → Theme** - dropdown grouped by Dark / Light. Dark: Catppuccin Mocha, Warm Dusk, Tokyo Night, Dracula, Nord, Gruvbox Dark, Rosé Pine, Solarized Dark. Light: Solarized Light, Catppuccin Latte, Rosé Pine Dawn, GitHub Light. Picking a preset recolors the whole app (tabs, sidebars, status bar, panel borders, accents, translucent overlays) - not just the terminal area.
- **AND syntax in every filter box** - type `auth AND bug` in any filter input (AI sessions, prompt history, file explorer, dir panel, command palette, terminal switcher, diff review) and only items matching every token show. SQLite-backed AI session search now also uses prefix matching, so partial words like `add AND refr` correctly find sessions about `refresh`.
- **AI session shimmer** - when a Claude Code or Copilot pane is waiting for your input, its border gently pulses so you spot it from across a multi-monitor setup. The shimmer suppresses itself the moment you focus the pane, and stays quiet until the AI finishes another turn. Toggle in Settings → Terminal → "AI session shimmer".
- **Drag-reorder workspace tabs** - in workspace tab mode, drag tabs to rearrange. Order persists across restarts.
- **Float button in pane title bar** - a corner-arrow icon in every pane's title bar floats / restores it. Tooltip shows the toggleFloat shortcut. Floating panes also show a persistent `[FLOAT]` pill in the title bar.
- **Clickable terminal-count in the status bar** - clicking `N terminals` opens a popover listing every terminal with its title, mode (tiled / floating / dormant / detached), and AI session status; click a row to focus it.
- **Time-sort + alphabetical folder groups** - AI sessions list defaults to alphabetical folder groups; switch to time-based sorting from the sort menu.
- **SQLite-backed Copilot session loading** - Copilot CLI's local SQLite store is read directly, dropping startup from seconds to ~150ms on busy machines.
- **`Ctrl+Shift+R` in a pane** focuses the rename input in the pane's title bar (in addition to the tab rename).
- **Drag-to-zoom on the downloads stats page** - drag horizontally on the chart to zoom into a time range; click `Reset zoom` to return.

### Bug Fixes

- **AI session watchers were dead in packaged builds** (TASK-143) - chokidar's transitive deps weren't bundled, so file change events never fired in the packaged app and the shimmer / live updates relied on stale data. Watchers now revive on app start in both dev and packaged.
- **Auto-link contamination** (TASK-142) - opening a fresh AI pane in the same cwd as another pane could steal the link target. tmax now prefers panes whose title was set from the user's first command before falling back to the focused pane.
- **`.md` paths split across two display rows** (TASK-132) are now stitched and clickable from either row, not just the top.
- **Middle-click on a pane title bar closes the pane** (TASK-107), matching the tab middle-click-close gesture.
- **Status bar terminal count** now correctly scopes to the active workspace in workspace tab mode and shows the global count in flat tab mode.
- **AI session search no longer returns long-running sessions where the search terms scattered through deep prompt history** - results are post-filtered to sessions whose displayed metadata (summary + repo + branch + cwd) matches every AND token, while OR / NOT queries still get the full FTS5 result set.
- **Copilot's `assistant.turn_end`** now sets session status to `waitingForUser` (mirroring Claude Code), so the shimmer and pane status dot fire after every Copilot reply, not only on rare confirmation events.

### Polish

- **Settings dialog height is pinned** across tabs - switching between Terminal / Theme / Keybindings / etc. no longer reflows the dialog box.
- **Floating panes show a `[FLOAT]` pill** in the pane title bar so the cue stays visible regardless of focus.
- **Float button icons** match the standard `maximize-2` / `minimize-2` diagonal-corner-arrows pattern (outward when tiled, inward when floating).
- **Landing page (`inbarr.github.io/tmax/`) refreshed** with a terminal-aesthetic top bar, sticky nav, hero terminal that types out `tmax --help`, and a green callout for the Sunday-release cadence. Includes a one-line `npm install -g tmax-terminal` install option with a copy button.
- **Stats page** shows a tooltip on the downloads-over-time chart explaining the drag-to-zoom gesture; zoom badge displays the active range.
- **Per-tab middle-click close**, hover-tinted active tabs that pick up the active theme's accent color.



A patch focused on copy/paste fixes for AI-CLI users.

### Bug Fixes

- **Drag-select copy in Copilot CLI / Claude Code** - dragging across text in a TUI with mouse reporting on, then right-clicking, now copies the highlighted text. Previously the right-click was a no-op (the v1.7.1 fix to stop image-only auto-paste accidentally left this gap), so the next paste leaked the previous clipboard contents.
- **ADO / IcM "Copy to clipboard" pastes the URL again** - when copying a PR title, work item, or incident link with ADO/IcM's "Copy to clipboard" button, tmax once more pastes the URL instead of just the title text. This regressed in v1.7.0 when the rich-text paste rules tightened to stop Teams "Click here for more" pastes from over-firing - the strict equality check rejected the realistic ADO HTML shape (`<a>label</a> : description`) where the description sits outside the link tag.
- **Multi-row copy no longer drops trailing-space gaps** - copying multi-row text from Claude Code output and pasting into a wrap-on-display editor used to render giant mid-line gaps where the rows joined. tmax now strips the row-padding trailing whitespace at copy time.
- **A second right-click after copying does not paste the just-copied text** - holdover from the drag-select fix; an immediate second right-click within 600ms of a copy is now a no-op instead of pasting the clipboard right back into the prompt.

### Polish

- **Dev-build indicator** - when tmax is launched via `npm start` (dev mode), the status bar shows a small orange "DEV" pill so you can tell at a glance which build is in front of you. The packaged build doesn't render it.
- **Fresh-launch escape hatch for dev** - set `TMAX_NO_RESTORE=1` (or pass `--no-restore`) and the dev instance starts empty AND skips saving on exit, so a second tmax for live-testing never clobbers the running packaged tmax's saved layout.
- **GitHub repo landing page** - extracted the contributing guidelines into a top-level `CONTRIBUTING.md`, and known issues + workarounds into `SUPPORT.md`. The README now points to both.

### Known Issues

- **Right-click copy after a *double-click* word selection in Copilot CLI / Claude Code** still falls through to paste-the-old-clipboard. The double-click is forwarded to the pty as a mouse event and never produces an xterm selection that tmax can read. Workarounds: drag-select instead, use `Ctrl+Shift+C`, or hold Shift while clicking. See `SUPPORT.md`.

## v1.7.2

A small patch focused on the startup experience.

### New Features

- **"Restoring session..." loading indicator** - on launch, while tmax is rebuilding your saved layout, you now see a neutral spinner instead of the empty-state hero. Previously the hero rendered for 1-3 seconds during restore and looked like the panes had been lost. The hero only shows now when restore actually completes with nothing to display.

### Performance

- **Faster session restore** - PTY spawns during session restore now run in parallel via `Promise.all` rather than sequentially. With N panes the startup time is roughly bounded by the slowest spawn instead of the sum of all spawns.
- **One less disk read at startup** - favoriteDirs / recentDirs now hydrate from the same `loadSession` payload that `restoreSession` reads, instead of duplicating the read.

## v1.7.1

A patch release focused on fixing URL clicks in Claude Code, polishing the empty state, and adding browser-style undo close.

### New Features

- **Undo close pane / workspace** - Ctrl+Shift+T pops the most recently closed pane (or whole workspace) back. Restores cwd, title, color, and resumes the AI session if it's still in the live list. 10-deep stack so you can walk back through closures. Confirms before restoring so an accidental keypress doesn't spawn PTYs unexpectedly. Ctrl+Shift+T was previously bound to the worktree panel - the panel still opens via the command palette and the StatusBar button.
- **Empty state hero** - the bare "Press Ctrl+Shift+N" page now renders the tmax logo, a "New terminal" button, and a "Resume recent session" list with your last 5 Copilot + Claude Code sessions. One-click resume.
- **tmax-styled message boxes** - the native white Windows confirm/alert dialogs are gone. New `AppDialog` component matches the dark theme: chevron logo header, accent-colored confirm, danger style for destructive actions (delete, reset). Used by pane restore, workspace restore, file delete, reset keybindings.
- **Changelog modal: View on GitHub** - the version dialog now has a footer link that opens `github.com/InbarR/tmax/releases` in your default browser.

### Bug Fixes

- **URL clicks now actually open in your browser from Claude Code panes** - the deny-then-implicit-fall-through assumption broke in newer Electron, so URLs were silently dropped. Now we call `shell.openExternal` explicitly. Affected every `https://` URL inside a Claude Code session output.
- **Move-to-workspace submenu** no longer renders off-screen when the parent menu is right-anchored. Detects right-overflow and flips the submenu to the left of the trigger row.

### Polish

- **AI Sessions list**: SVG chevrons replace the unicode triangles for the collapse-all toggle and per-group headers - crisper at any DPI, smooth rotation on toggle.

## v1.7.0

A big release - **workspaces** lands as the headline feature, plus a deep round of paste / scroll / link / notification fixes and polish.

### New Features

- **Workspaces** - a tab is now a collection of panes. Switch workspaces from the tab bar, layouts and pane state are preserved per workspace. Per-workspace color tints, colorize toggle, polished workspace tab bar.
- **Multi-select panes in workspaces** - Ctrl+click (Cmd+click on Mac) on a pane title bar to select multiple panes; visible "Show Selected (N)" toolbar button + Command Palette commands ("Show Selected Panes", "Show All Panes", "Clear Pane Selection") + pane menu entries with a Ctrl/Cmd+Click hint.
- **Move pane to workspace** - per-pane overflow menu and Command Palette entry to relocate an existing pane into another workspace without recreating it. PTY / cwd / scrollback survive the move.
- **Focus-mode pane indicator** - in workspaces + focus mode, a subtle row of dots at the bottom of the focused pane shows pane count, marks the focused one, and lets you switch with a click. Ctrl+Tab still works for power users.
- **In-tmax image preview** - click image paths in the terminal (`.png/.jpg/.jpeg/.gif/.bmp/.webp`) to open an in-app preview side-panel with zoom and drag-resize. Works for absolute, relative, and bare-basename paths (Copilot CLI shows pasted clipboard images as `[basename.png]` - those resolve too). "Open externally" button still routes to the OS viewer.
- **Markdown preview overlay** - click `.md` paths in the terminal to open a side-panel with rendered markdown, mermaid diagrams, zoom, drag-to-resize, and Friendly/Raw toggle.
- **Native AI session notifications** - tmax fires its own OS toast when Claude Code or Copilot CLI finishes a turn or asks for approval. Settings toggle lets you disable if you prefer an external hook plugin. Toast click brings tmax to the front; toast header reads "tmax" on Windows (was `electron.app.Electron`); body shows session summary + branch + latest prompt and respects user-renamed pane titles.
- **Faster prompt search (Ctrl+Shift+Y)** - results stream in progressively as each session resolves rather than waiting for all of them; mtime-keyed cache makes reopens near-instant. Visible jump-glyph (↗ for live panes, ↑ for inactive sessions) signals each row is clickable. Cross-workspace jumps switch workspaces before focusing. Inactive sessions resume in a new pane via `<provider> --resume <id>` (same flow as the AI Sessions sidebar Resume).
- **AI Sessions header polish** - Refresh button promoted to the visible toolbar; Group toggle moved into the overflow menu next to "Show running only".
- **VSCode-style keybindings.json** - customize shortcuts via an on-disk file.
- **Configurable Vite port** - set `TMAX_VITE_PORT` to override the renderer dev port.

### Bug Fixes

- **URL clicks no longer open twice** - removed redundant `shell.openExternal` call; URLs with embedded emoji also stitch correctly across hard newlines past the emoji.
- **Rich-text paste prefers visible text** over link URL or PNG path; stricter standalone-link detection so prose with an inline link no longer gets clobbered.
- **Right-click paste with image clipboard** skips auto-paste when the clipboard is image-only (issue #84).
- **Mouse wheel scroll-down during streaming** - pre-sync xterm viewport on wheel so the live prompt line is reachable.
- **Stale "last prompt" bar** - upserts in updateSession so the bar tracks the latest input.
- **Clipboard image paths survive restart** - stable temp dir + per-file 6h sweep replaces dir-on-shutdown deletion. Old paths in scrollback stay clickable across tmax restarts.
- **Terminal title no longer fixates on first command** - the auto-title from your first command (e.g. `cd <path>`) used to block AI sessions from retitling the pane to their topic. Now AI session topics win over first-command auto-titles, while explicit user renames still win over both. Fixes #85.
- **Workspaces ↔ flat tabs ↔ grid view** - flat tab mode lists every pane across all workspaces; grid view in flat mode shows them all; in workspaces mode, focus→grid stays scoped to the active workspace's panes.
- **Voice Access focus thrash** - stop fighting Voice Access for focus; dictation no longer splices utterances mid-string.
- **Markdown / mermaid renderer hardened** - sanitized output to prevent renderer-side script injection.
- **Ctrl+W frees up for shell readline** - close pane moved to Ctrl+Shift+W.
- **Stale session name on pane re-link** - cleared correctly when relinking a pane.
- **Diff Review send button label** - uses the dynamic agent label (#78).

### Internals

- xterm helper textarea hidden from UIA so screen readers / Voice Access stop misplacing the overlay.
- Regression test pass for 12 merged PRs.
- 3s timeouts on `netstat` / `tasklist` / `ps` in the prestart hook so `npm start` never hangs.

### Contributors

@yodobrin, @yoziv, @omer91se, plus Claude Code and Copilot CLI agents.

---

## v1.6.1

A focused polish release on top of v1.6.0 - lots of fixes around the AI Sessions sidebar, plus paste / float / pane-title edge cases.

### New Features

- **🧹 Cleanup sessions** - bulk-archive AI sessions below a prompt-count threshold from the AI Sessions overflow menu. Live "will archive N sessions" forecast as you type the threshold; pinned and already-archived sessions are skipped. Underlying transcript files are not deleted.
- **Auto-archive stale AI sessions** - on app start, sessions that haven't been touched in 14 days (configurable via `aiAutoArchiveDays`) and one-shot abandoned sessions (`messageCount < 2` after 1 day) move to Archived automatically. Pinned and manually-archived sessions are never touched.
- **Show in AI sessions** - new pane ⋯ menu item that opens the AI Sessions sidebar and reveals the session linked to that pane, expanding its repo group and clearing any blocking filter.
- **Header overflow menu** - the AI Sessions panel header now has a single `⋯` menu for Refresh, Show running only, Collapse/Expand all groups, and Cleanup sessions. Less visual clutter; Group toggle stays inline.

### Bug Fixes

- **Multi-line paste** (#77): right-click paste in main and detached windows now wraps in bracketed-paste markers when the shell supports it - was silently dropping all but the last line in Claude Code / Copilot CLI / PSReadLine. Closes the gap left by the v1.6.0 Ctrl+V fix.
- **Pane title respects session renames** (#75, thanks @omer91se): a fresh terminal that auto-binds to a session with a user-renamed title now picks up the override instead of the auto-generated summary.
- **AI Sessions sidebar highlights the right session**: clicking a pane now reliably highlights its session in the sidebar. Fixed three independent causes - sticky auto-link bindings (terminal kept old session.id when a fresh AI process arrived in the same pane), session row hidden inside a collapsed group, and mouse-hover stomping the focused-pane highlight. The pane's session row now has a stable `pane-active` indicator independent of hover/select.
- **Float toggle preserves grid layout**: floating a pane out of a 2x2 grid and toggling back no longer flattens the grid into a 1x4 row. The pane returns to its original split direction, ratio, and position.
- **Cwd casing no longer duplicates group headers**: sessions with cwds that differ only in case (`C:\projects\ClawPilot` vs `...\clawpilot` - same Windows folder) now collapse into a single group instead of stacking two identical-looking headers.
- **Garbage session summaries hidden**: rows whose summary was pure structural noise (e.g. lone `|-`) now fall back to the cwd / repo / id label. Root cause shipped too: the Copilot session parser now correctly handles YAML block scalars (`summary: |-` followed by indented content) that were previously truncated to `|-`.

### Internals

- New regression spec coverage for paste wrapping, sidebar highlight, float restore, cwd-case grouping, hover-vs-pane-active, soft-wrap copy, and session cleanup. Soft-wrap copy spec confirms xterm correctly joins visually-wrapped lines on copy (so when paste contains spurious newlines, the source - usually an AI tool's prose wrapping - is the culprit, not tmax).

### Contributors

- @omer91se
- @yodobrin
- @InbarR

## v1.6.0

### New Features

- **Session summary popover**: Plain-language story of where each AI session is, built from real prompts, with a copy button and "Show prompts" shortcut
- **Latest prompt banner**: Each AI pane shows its most recent prompt at the bottom of the terminal - click the banner text to jump to it in the buffer, or open the full prompt history
- **Search prompts across all panes**: Ctrl+Shift+Y opens a global prompt search across every AI session
- **Pin AI sessions**: Pin sessions to a top-level "Pinned" group; pins survive save/restore
- **Floating panes**: Drag any pane out by its title bar; Ctrl+Alt+F toggles float/restore, restored panes land back at their original tab-order position
- **Hidden panes indicator**: Status-bar 👁 button surfaces hidden panes with a popover that lists pid/process per row and a "Wake all" button
- **Per-pane overflow menu**: Title-bar buttons collapse into a ⋯ menu styled to match the status bar, with a Float/Restore toggle
- **Rotating tips in the status bar**: A subtle tips system that surfaces shortcuts and features over time
- **Footer overflow menu**: Low-traffic items (Broadcast, etc.) move into a footer ⋯ menu to declutter the status bar
- **In-app changelog modal**: Read release notes without leaving tmax
- **Configurable show-window global hotkey**: Customize or disable the global hotkey from Settings
- **Ctrl+T / Ctrl+W**: New and close terminal, matching common terminal app conventions
- **Outlook safelinks unwrap on paste**: Pasted Outlook safelinks become the original URL automatically
- **AI sessions list shows latest prompt**: Each session row previews its most recent prompt, with deep prompt-history search
- **Auto-link AI sessions by cwd + recency**: Sessions auto-attach to panes with matching working directories instead of guessing by process name
- **Pwsh shell integration via launch args**: Adopts the VS Code pattern so the integration snippet no longer leaks into the buffer

### Fixes

- **URL detection across wrapped rows** (#62): URLs that wrap across many terminal rows are now detected for click/copy
- **Right-click paste in detached windows** (#72): Right-click paste and the mouse-event blocker now work in detached terminal windows
- **Terminal buffer preserved across float/dock moves** (#76): Floating, docking, and grid rebuilds no longer clear pane content
- **Right-click no longer leaks as double paste**: Mouse events stop bleeding through to the pty
- **Cursor stays hidden through bracketed-paste flips**: xterm cursor no longer flickers visible during paste in alt-screen apps
- **Slash-command sessions display as /name**: Claude Code slash-command sessions show their command name instead of raw XML
- **Jump-to-prompt robustness**: Better feedback when the prompt isn't in xterm's buffer; jumps recenter the match instead of pinning it to the viewport edge
- **Self-healing grid layout**: Tiled terminals missing from the tiling root are recovered instead of leaving holes

## v1.3.6

### New Features

- **Configurable AI session commands**: Copilot and Claude Code base commands are now customizable via Settings > Terminal — use custom aliases or wrapper scripts (#4)

## v1.3.4

### New Features

- **Clipboard image paste**: Screenshot to clipboard, then Ctrl+V (or Cmd+V on macOS) pastes the image as a temp file path — useful for sharing screenshots with AI tools like Claude Code and Copilot

### Fixes

- **macOS paste**: Paste shortcuts (Ctrl+V / Cmd+V) now work correctly on macOS across main and detached terminal windows
