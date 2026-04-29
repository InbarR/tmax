# Changelog

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
