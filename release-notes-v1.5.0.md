## tmax v1.5.0

A major release with new features, community contributions, and cross-platform improvements.

### Features
- **File Explorer** (Ctrl+Shift+X) — Sidebar file tree with breadcrumb navigation, inline file preview, right-click menu, WSL support
- **File Preview** — Click any text file to preview in a resizable side panel. Double-click opens in editor.
- **Tab Groups** — Group tabs with shared colors, collapsible headers, rename, color picker, drag between groups
- **Session Lifecycle** — Active / Completed / Archived tabs in AI Sessions panel. Mark sessions as completed, archive old ones, auto-reactivation on new activity with toast notifications
- **Multi-select Sessions** — Ctrl+click to select multiple, right-click to change lifecycle in bulk
- **Status Indicators** — Green/grey/red dot per pane showing process state
- **Editable Pane Title** — Double-click pane title to rename inline
- **Close Button on Status Dot** — Hover to reveal close button
- **WSL Integration** — Discover AI sessions from WSL distros, file explorer works with WSL paths
- **macOS Support** — All Ctrl shortcuts work with Cmd, native symbols in UI
- **Seamless Auto-Updates** — Proper Squirrel RELEASES format on Windows, macOS fallback, Linux package download
- **Modern Tab Styling** — Rounded pill tabs, subtle borders, colors as bottom line
- **Font Picker** — Shows all installed monospace fonts
- **Jump to Prompt** (Ctrl+Shift+K) — Navigate to any previous AI prompt
- **Hide/Show Tab Bar** (Ctrl+Shift+B)
- **Dark Title Bar** — Forced dark regardless of system theme
- **Configurable Old Session Threshold** — Settings > Terminal (default 30 days)

### Bug Fixes
- Focus mode flicker eliminated
- Cursor no longer overflows below status bar
- Sessions panel context menu stays within viewport
- Detached window copy works on macOS (Cmd+C)
- Removed MS-internal tool references from public repo
- WSL UNC paths use forward slashes for Node.js compatibility

### Contributors
Thanks @dwizzzle, @Eitan-Shteinberg, @omer91se, @yoziv, @Danielionin, @aviellavie!
