# Contributing to tmax

Contributions are very welcome - bug reports, feature ideas, and pull requests all help make tmax better.

> **Use your personal GitHub account, not your org/EMU account** when filing issues or opening PRs. EMU accounts are typically blocked from interacting with public repos outside their enterprise.

## Reporting bugs

Open an issue on the [GitHub tracker](https://github.com/InbarR/tmax/issues) with:
- Your OS and tmax version (shown in the title bar / About)
- Steps to reproduce
- What you expected vs. what happened
- Screenshots or a short screen recording if the bug is visual

## Suggesting features

For larger ideas, open an issue first to discuss the shape of the change before writing code. Smaller polish PRs (typos, copy fixes, obvious bugs) can go straight to a PR.

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Set up the dev environment (see [Building from Source](README.md#building-from-source)) and run `npm start` to verify the app launches.
3. Make your change. Keep PRs focused - one feature or fix per PR.
4. **Cross-platform compatibility is required.** tmax ships on Windows, macOS, and Linux. Use `isMac ? event.metaKey : event.ctrlKey` for primary modifiers, `formatKeyForPlatform()` for shortcut text in the UI, and avoid hardcoded paths or shell assumptions. See [`CLAUDE.md`](CLAUDE.md) for the full guidelines.
5. Run the e2e test suite: `npm run test:e2e`. Add a Playwright spec under `e2e/` for any user-visible bug fix or new feature.
6. Open the PR with a description of what changed and why, plus any UI screenshots.

## Code style

- TypeScript strict mode, React function components, Zustand for state.
- No new dependencies without a clear reason - tmax keeps its dependency surface small.
- Match the surrounding code's formatting (no separate formatter config to wrestle with).

## Project management

Larger work is tracked with [Backlog.md](https://github.com/MrLesk/Backlog.md) under `backlog/tasks/`. You don't need to use it to contribute, but if you're picking up an existing task, set its status to In Progress and assign yourself first (`backlog task edit <id> -s "In Progress" -a @your-handle`).
