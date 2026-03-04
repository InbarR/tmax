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

**Grid View Mode**
- Toggle between Focus (single terminal) and Grid layout (`Ctrl+Shift+F`)
- Grid auto-arranges terminals: 2x2, 3x2, etc. based on terminal count
- Cycle grid column count with `Ctrl+Shift+L` (1-col stack, 2-col, 3-col, ...)
- Fully resizable dividers in grid mode

**AI Sessions Panel**
- Monitor GitHub Copilot and Claude Code sessions in real-time (`Ctrl+Shift+C`)
- Shows session status, summary, branch, repo, message/tool counts, and relative time
- Click a session to resume it directly in a new terminal pane
- Filter tabs: All / Copilot / Claude Code
- Search across sessions by name, branch, cwd, or summary
- Desktop notifications when a Copilot session needs approval or input
- Sessions automatically filtered to last 7 days and deduplicated

**Keyboard-Driven Workflow**
- Command palette (`Ctrl+Shift+P`) with every action searchable
- Jump to any terminal by name (`Ctrl+Shift+G`)
- Split, move, resize, and navigate -- all from the keyboard
- Every shortcut is fully configurable

**Drag & Drop**
- Drag tabs to split panes (left/right/top/bottom indicators)
- Drag to swap terminal positions
- Drag to detach as floating panel
- Visual drop zone labels showing exactly where the terminal will land

**Session Management**
- Auto-save/restore on close, crash, or reboot (saves every 5 seconds)
- Named layouts: save and load terminal arrangements with titles and working directories
- Startup commands per terminal -- restored when loading a layout

**External Links**
- Links open in your default browser, not inside the app

**Configurable Everything**
- Settings UI (`Ctrl+,`) with tabs for Terminal, Keybindings, Shells, and Theme
- Re-record any keybinding by clicking it
- Add/remove shell profiles (PowerShell, CMD, WSL, or any executable)
- Set default start folder globally or per shell
- 10 built-in color themes (or create your own with color pickers)

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+N` | New terminal |
| `Ctrl+Shift+W` | Close terminal |
| `Ctrl+Shift+R` | Rename terminal |
| `Ctrl+Shift+G` | Jump to terminal by name |
| `Shift+Arrow` | Move focus between panes |
| `Ctrl+Shift+Arrow` | Move/swap terminal in direction |
| `Ctrl+Alt+Arrow` | Split in that direction |
| `Ctrl+Shift+F` | Toggle view mode (Focus / Grid) |
| `Ctrl+Shift+L` | Cycle grid column layout |
| `Ctrl+Shift+C` | AI Sessions panel (Copilot / Claude) |
| `Ctrl+Shift+D` | Directory favorites panel |
| `Ctrl+Shift+E` | Equalize all pane sizes |
| `Ctrl+Shift+Alt+Arrow` | Resize pane |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+,` | Open settings |
| `Ctrl+Shift+/` | Show all shortcuts |

All shortcuts are remappable in Settings > Keybindings.

## Tab Context Menu

Right-click any tab for:
- Rename
- Split Right / Down
- Float / Dock
- Set Startup Command
- New Terminal (pick shell)
- Close / Close Others / Close All

## Download

Download the latest version from the [Releases page](https://github.com/InbarR/tmax/releases). Available for Windows (.exe installer + portable .zip), macOS (.dmg for Apple Silicon and Intel), and Linux (.deb, .rpm).

> **macOS:** If you see _"tmax is damaged and can't be opened"_, run: `xattr -cr /Applications/tmax.app`

## Building from Source

### Prerequisites

- Node.js 18+
- npm
- **Windows**: Visual Studio Build Tools (for node-pty native compilation)
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
- **Windows**: `out/make/squirrel.windows/x64/tmax-1.0.0.Setup.exe`
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
  preload/        Secure IPC bridge (contextBridge)
  renderer/       React UI
    state/          Zustand store + binary tree / grid layout engine
    components/     Terminal, TabBar, TilingLayout, FloatingPanel,
                    CopilotPanel, CommandPalette, Settings, etc.
    hooks/          Keybindings, drag & drop, PTY helpers
    styles/         Global CSS (Catppuccin theme)
  shared/         IPC channel constants, AI session types
```

**Key design decisions:**
- Binary tree layout engine for tmux-style tiling with arbitrary splits
- Zustand for state management (terminals, layout, focus, config)
- `@dnd-kit` for structured drag & drop with per-pane drop zones
- `node-pty` with ConPTY for native Windows terminal emulation
- `contextIsolation: true` for Electron security
- Session auto-save every 5s for crash recovery

## Configuration

Settings are stored at:
```
%APPDATA%/tmax/tmax-config.json
```

You can edit this file directly or use the Settings UI (`Ctrl+,`).

## License

MIT
