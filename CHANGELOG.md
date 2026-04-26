# Changelog

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
