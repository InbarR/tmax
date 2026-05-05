# Support & Known Issues

Need help with tmax? Open an issue on the [GitHub tracker](https://github.com/InbarR/tmax/issues) - see [CONTRIBUTING.md](CONTRIBUTING.md) for what to include.

## Known Issues

### Right-click copy after double-click in TUIs with mouse reporting

In TUI apps that enable SGR mouse reporting (notably **Copilot CLI**, sometimes **Claude Code**), a double-click is forwarded to the pty as a mouse event rather than producing an xterm selection. The TUI may show its own visual highlight, but tmax has no selection to copy - so a follow-up right-click pastes the previous clipboard contents instead of copying the highlighted word.

**Workarounds:**
- **Drag-select** (left-click and drag across the text) instead of double-clicking. tmax snapshots the dragged text directly from the terminal buffer; right-click then copies it as expected.
- **`Ctrl+Shift+C` to copy** when you do have an xterm-native selection (the keyboard shortcut isn't subject to the same right-click timing).
- **Hold Shift while clicking/dragging** - this bypasses mouse reporting in xterm and forces a native selection.

This only affects double-click / triple-click word and line selection in TUIs that capture mouse events. Drag-select copy works in all modes.
