# Changelog

## v1.7.3

A performance release that leverages Copilot CLI's local SQLite database for session loading and search.

### Performance

- **SQLite-backed session loading** - Copilot CLI sessions now load from `~/.copilot/session-store.db` instead of scanning thousands of filesystem directories. Initial session list loads in ~200ms vs ~3-4s previously. Gracefully falls back to filesystem scanning when the DB is unavailable (e.g. Claude Code sessions, fresh installs, old CLI versions).

### New Features

- **Full-text search across all sessions** - session search now uses SQLite FTS5 to search ALL sessions (6,000+), not just the 314 loaded in memory. Supports AND/OR operators (e.g. `Swetha AND throttling`, `deploy OR rollback`).
- **Prompt search across all sessions** - the prompt search dialog (Ctrl+Shift+Y) now searches prompts across all historical sessions via SQLite when typing 4+ characters, with AND/OR support.
- **Search syntax hints** - search box placeholder and tooltip show AND/OR usage examples when SQLite is active.
- **Load-more hidden** - the "Loaded X of Y / +100 / All" bar is hidden when SQLite is active (all sessions are queryable instantly).
- **Search ignores lifecycle tabs** - when searching, results show across Active/Completed/Archived instead of being filtered by the selected tab.

### Bug Fixes

- **Archived tooltip corrected** - tooltip now accurately reflects auto-archive criteria: "inactive 14+ days, or <2 prompts after 1+ day" (was incorrectly showing 30+ days).
- **Search debounce increased** - debounce increased from 200ms to 500ms to avoid overwhelming the IPC with intermediate keystrokes during SQLite queries.

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
