# Support & Known Issues

Need help with tmax? Open an issue on the [GitHub tracker](https://github.com/InbarR/tmax/issues) - see [CONTRIBUTING.md](CONTRIBUTING.md) for what to include.

## Known Issues

### Double-clicking a word in Copilot CLI / Claude Code, then right-clicking, doesn't copy

In **Copilot CLI** (and sometimes **Claude Code**), if you double-click a word to select it and then right-click, tmax pastes whatever was previously on your clipboard instead of copying the highlighted word.

This happens because those tools take over the mouse to power their own UI, so when you double-click, tmax never actually sees a selection to copy from - even though the word looks highlighted on screen.

**What works instead:**
- **Drag across the text** with the left mouse button (instead of double-clicking), then right-click. This works correctly.
- **Press `Ctrl+Shift+C`** to copy when you've already made a selection.
- **Hold `Shift`** while you click or drag - this forces a normal text selection that tmax can copy.

Triple-click line selection has the same limitation. Plain drag-select copy works everywhere.
