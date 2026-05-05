<p align="center">
  <img src="assets/icon.png" alt="tmax logo" width="128" />
</p>

<h1 align="center">tmax</h1>

<p align="center">A powerful cross-platform multi-terminal app with tiling layouts, floating panels, and a keyboard-driven workflow.</p>

Built with Electron, React, TypeScript, xterm.js, and node-pty.

![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white) ![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white) ![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black) ![Electron](https://img.shields.io/badge/Electron-30-47848F) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

![tmax Screenshot](assets/screenshot.png)

## Features

**Multiple Terminals in One View**
- Tiling layout with horizontal/vertical splits (binary tree, like tmux)
- Floating panels that can be dragged, resized, and maximized
- Equalize all panes to the same size with one shortcut
- Status indicators per pane (green = active, grey = idle, red = error)
- Focused pane highlighted with green-tinted title bar

**Grid View Mode**
- Toggle between Focus (single terminal) and Grid layout (`Ctrl+Shift+F`)
- Grid auto-arranges terminals: 2x2, 3x2, etc. based on terminal count
- Cycle grid column count with `Ctrl+Shift+L` (1-col stack, 2-col, 3-col, ...)
- Fully resizable dividers in grid mode

**Tab Groups**
- Group related tabs with shared colors and collapsible headers
- Right-click tab > Add to Group (supports multi-select with Ctrl+click)
- Group header right-click: Rename, Color picker, Ungroup All, Close All
- Drag tabs between groups to reorganize
- Group color tints both tabs and terminal pane backgrounds

**AI Sessions Panel**
- Monitor GitHub Copilot and Claude Code sessions in real-time (`Ctrl+Shift+C`)
- Shows session status, summary, branch, repo, message/tool counts, and relative time
- Click a session to resume it directly in a new terminal pane
- Jump to any previous prompt in the terminal (`Ctrl+Shift+K`)
- Filter tabs: All / Copilot / Claude Code
- Search across sessions by name, branch, cwd, or summary
- Desktop notifications when a Copilot session needs approval or input
- WSL session discovery — sessions from WSL distros appear with a distro badge

**File Explorer**
- Sidebar file tree for the focused terminal's CWD (`Ctrl+Shift+X`)
- Breadcrumb path navigation — click any segment to jump, or type a path directly
- Navigate up, home (terminal CWD), or double-click folders to enter
- File type icons (TS, JS, JSON, CSS, HTML, MD, PY, and more)
- Single click to preview file content in a resizable side panel
- Double click to open in default editor
- Right-click menu: Preview, Open in Editor, Browse Here, CD Here, Copy Path
- Filter input, show/hide dotfiles toggle, collapse all button
- WSL filesystem support

**Diff Review**
- Built-in diff review overlay for code changes
- File tree with filter search
- Inline code review with annotations

**Keyboard-Driven Workflow**
- Command palette (`Ctrl+Shift+P`) with every action searchable
- Jump to any terminal by name (`Ctrl+Shift+G`)
- Pane hints for quick terminal switching (`Ctrl+Shift+J`)
- Split, move, resize, and navigate — all from the keyboard
- Every shortcut is fully configurable
- macOS support: all Ctrl shortcuts work with Cmd, UI shows native symbols (⌘/⌥)

**Modern Tab Bar**
- Rounded pill-style tabs with subtle borders
- Hide/show tab bar (`Ctrl+Shift+B`) for maximum screen space
- Tab colors shown as bottom line indicator
- Drag & drop to reorder or split

**Appearance**
- Font picker with all installed monospace fonts
- Windows 11 Mica/Acrylic transparency (Appearance tab in Settings)
- Background material and opacity controls
- 10 built-in color themes or create your own
- Dark title bar forced regardless of system theme

**Drag & Drop**
- Drag tabs to split panes (left/right/top/bottom indicators)
- Drag to swap terminal positions
- Drag to detach as floating panel
- Visual drop zone labels showing exactly where the terminal will land

**Session Management**
- Auto-save/restore on close, crash, or reboot (saves every 5 seconds)
- Named layouts: save and load terminal arrangements with titles and working directories
- Startup commands per terminal — restored when loading a layout

**WSL Integration**
- Discover AI sessions running inside WSL distros
- Sessions appear with distro badge in the AI Sessions panel
- Resume WSL sessions in the correct distro and working directory
- File explorer works with WSL filesystems
- Terminal CWD tracking translates WSL paths for the Dirs panel

**Configurable Everything**
- Settings UI (`Ctrl+,`) with tabs for Terminal, Keybindings, Shells, Theme, and Appearance
- Re-record any keybinding by clicking it
- Add/remove shell profiles (PowerShell, CMD, WSL, or any executable)
- Set default start folder globally or per shell

## Tab Context Menu

Right-click any tab for:
- Rename
- Split Right / Down
- Focus / Split Mode
- Float / Dock / Detach
- Add to Group / Change Group
- Tab Color picker
- Set Startup Command
- Hide Tab Bar
- New Terminal (pick shell)
- Close / Close Others / Close All

## Download

Download the latest version from the [Releases page](https://github.com/InbarR/tmax/releases). Available for Windows (.exe installer + portable .zip), macOS (.dmg for Apple Silicon and Intel), and Linux (.deb, .rpm).

### Troubleshooting Downloads

tmax is an independent open-source project and isn't code-signed (certificates cost $300-600/year on Windows and $99/year on macOS). Your browser and operating system may warn you about the download. All of these warnings are cosmetic - nothing is wrong with the file itself. Here's how to get past each one.

---

#### 🪟 Windows

**"isn't commonly downloaded" (Edge / Chrome)**

![Edge SmartScreen warning](docs/screenshots/download-warn-edge.png)

Your browser may silently pause the download and show the message above, or quietly stash it as `Unconfirmed *.crdownload` in your Downloads folder:

![Unconfirmed crdownload](docs/screenshots/download-warn-crdownload.png)

This is [Microsoft SmartScreen's reputation filter](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) - new / niche installers trigger it regardless of content.

To allow the download:
1. In the download warning, click the **⋯** menu and choose **Keep**. Edge then shows a second dialog:

   ![Edge Keep confirmation](docs/screenshots/download-warn-edge-expanded.png)

2. Click the **dropdown arrow** next to the red **Delete** button and choose **Keep anyway**.

**"Windows protected your PC" on first launch**

After installing, the first time you run tmax you'll see a blue "Windows protected your PC" dialog from SmartScreen. Click **More info** at the top, then **Run anyway** at the bottom.

---

#### 🍎 macOS

**"tmax is damaged and can't be opened"**

![macOS damaged warning](docs/screenshots/download-warn-macos.png)

Despite what the dialog says, the app is fine. macOS requires apps to be signed with an Apple Developer certificate ($99/year). Since I'm not planning to pay that evil company 😏, you have to bypass the quarantine flag yourself. Click **Cancel** (not Move to Trash!) and run this in Terminal:

```bash
xattr -cr /Applications/tmax.app
```

This clears the quarantine extended attribute so macOS skips the signature check. Open tmax normally afterwards.

If you installed to a different location, adjust the path (e.g. `~/Applications/tmax.app`).

---

## Building from Source

### Prerequisites

- Node.js 18+
- npm
- **Windows**: [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with "Desktop development with C++" workload (for node-pty native compilation). VS 2025+ is not yet supported by node-gyp — if you only have VS 2025, install the 2022 Build Tools alongside it and set `GYP_MSVS_VERSION=2022` before running `npm install`.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential`, `python3`, `libx11-dev`, `libxkbfile-dev`

### Install & Run

```bash
git clone https://github.com/InbarR/tmax.git
cd tmax
npm install
npm start
```

### Build Installer

```bash
npm run build
```

Output per platform:
- **Windows**: `out/make/squirrel.windows/x64/tmax-<version> Setup.exe`
- **macOS**: `out/make/*.dmg`
- **Linux**: `out/make/deb/x64/*.deb` and `out/make/rpm/x64/*.rpm`
- **All**: portable `.zip`

## Architecture

```
src/
  main/           Electron main process
    main.ts                     Window creation, IPC handlers
    pty-manager.ts              node-pty lifecycle management
    config-store.ts             electron-store config persistence
    copilot-session-monitor.ts  Scans ~/.copilot/session-state/
    copilot-session-watcher.ts  File watcher for Copilot sessions
    copilot-events-parser.ts    Incremental JSONL parser for Copilot events
    copilot-notification.ts     Desktop notifications for Copilot
    claude-code-session-monitor.ts  Scans ~/.claude/projects/
    claude-code-session-watcher.ts  File watcher for Claude Code sessions
    claude-code-events-parser.ts    JSONL parser for Claude Code sessions
    wsl-session-manager.ts      Manages session monitors for WSL distros
    wsl-utils.ts                WSL distro detection and path translation
    git-diff-service.ts         Git diff parsing for code review
    version-checker.ts          Auto-update via GitHub releases
    diag-logger.ts              Diagnostic logging for debugging
  preload/        Secure IPC bridge (contextBridge)
  renderer/       React UI
    state/          Zustand store + binary tree / grid layout engine
    components/     Terminal, TabBar, TilingLayout, FloatingPanel,
                    CopilotPanel, FileExplorer, DiffReview,
                    CommandPalette, Settings, etc.
    hooks/          Keybindings, drag & drop, PTY helpers
    utils/          Platform detection (macOS/Windows/Linux)
    styles/         Global CSS (Catppuccin theme)
  shared/         IPC channel constants, AI session types, diff types
```

**Key design decisions:**
- Binary tree layout engine for tmux-style tiling with arbitrary splits
- Zustand for state management (terminals, layout, focus, config)
- `@dnd-kit` for structured drag & drop with per-pane drop zones
- `node-pty` with ConPTY for native Windows terminal emulation
- `contextIsolation: true` for Electron security
- Session auto-save every 5s for crash recovery
- Renderer heartbeat for freeze detection diagnostics

## Configuration

Settings are stored at:
```
%APPDATA%/tmax/tmax-config.json
```

You can edit this file directly or use the Settings UI (`Ctrl+,`).

### AI Session Commands

The commands used to resume Copilot and Claude Code sessions are configurable in **Settings > Terminal**:

| Setting | Default | Description |
|---------|---------|-------------|
| Copilot Command | `copilot` | Base command for Copilot sessions |
| Claude Code Command | `claude` | Base command for Claude Code sessions |

This lets you use custom aliases or wrapper scripts. The configured command is invoked as `<command> --resume <sessionId>`.

## Known Issues

### Right-click copy after double-click in TUIs with mouse reporting

In TUI apps that enable SGR mouse reporting (notably **Copilot CLI**, sometimes **Claude Code**), a double-click is forwarded to the pty as a mouse event rather than producing an xterm selection. The TUI may show its own visual highlight, but tmax has no selection to copy - so a follow-up right-click pastes the previous clipboard contents instead of copying the highlighted word.

**Workarounds:**
- **Drag-select** (left-click and drag across the text) instead of double-clicking. tmax snapshots the dragged text directly from the terminal buffer; right-click then copies it as expected.
- **`Ctrl+Shift+C` to copy** when you do have an xterm-native selection (the keyboard shortcut isn't subject to the same right-click timing).
- **Hold Shift while clicking/dragging** - this bypasses mouse reporting in xterm and forces a native selection.

This only affects double-click / triple-click word and line selection in TUIs that capture mouse events. Drag-select copy works in all modes.

## Contributing

Bug reports, feature ideas, and pull requests are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on filing issues, opening PRs, code style, and the project management setup.

## License

MIT
