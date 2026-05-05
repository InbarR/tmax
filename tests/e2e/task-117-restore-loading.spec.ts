import { test, expect, _electron } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// TASK-117 regression: when a multi-pane session is being restored on launch,
// the empty-state hero must NOT flash on screen. Today TilingLayout falls
// through to <EmptyState /> while restoreSession is still spawning ptys
// serially, so users see "looks empty" for ~1-2s on relaunch with N panes.
//
// The fix has two parts:
//   1. Track an `isRestoring` flag in the store; render a loading indicator
//      instead of the empty-state hero while the flag is set.
//   2. Parallelize createPty calls in restoreSession so N panes attach in
//      ~1 spawn time instead of N spawn times.
//
// This spec seeds a 4-leaf session.json before launch, then verifies:
//   - DOM never contains `.empty-state` between window-open and panes-attach.
//   - All four panes attach within a generous wall-clock budget.

const FOUR_PANE_SESSION = {
  session: {
    favoriteDirs: [],
    recentDirs: [],
    autoColorTabs: true,
    sessionNameOverrides: {},
    sessionLifecycleOverrides: {},
    sessionPinned: {},
    activeWorkspaceId: 'ws-default',
    workspaces: [
      {
        id: 'ws-default',
        name: 'Default',
        tree: {
          kind: 'split',
          direction: 'horizontal',
          splitRatio: 0.5,
          first: {
            kind: 'split',
            direction: 'vertical',
            splitRatio: 0.5,
            first: { kind: 'leaf', terminal: { title: 'pane-1', shellProfileId: 'default', cwd: 'C:\\Users' } },
            second: { kind: 'leaf', terminal: { title: 'pane-2', shellProfileId: 'default', cwd: 'C:\\Users' } },
          },
          second: {
            kind: 'split',
            direction: 'vertical',
            splitRatio: 0.5,
            first: { kind: 'leaf', terminal: { title: 'pane-3', shellProfileId: 'default', cwd: 'C:\\Users' } },
            second: { kind: 'leaf', terminal: { title: 'pane-4', shellProfileId: 'default', cwd: 'C:\\Users' } },
          },
        },
        floating: [],
      },
    ],
    // Legacy mirrors (some older code paths read these)
    tree: null,
    floating: [],
  },
};

test('multi-pane session restore does not flash the empty-state hero', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'tmax-e2e-restore-'));
  writeFileSync(
    join(userDataDir, 'tmax-session.json'),
    JSON.stringify(FOUR_PANE_SESSION),
    'utf8',
  );

  const outDir = process.env.TMAX_E2E_OUT_DIR || 'out-e2e';
  const exePath = join(process.cwd(), outDir, 'tmax-win32-x64', 'tmax.exe');
  if (!existsSync(exePath)) {
    throw new Error(`Packaged tmax not found at ${exePath}. Run \`npm run package\` first.`);
  }

  const app = await _electron.launch({
    executablePath: exePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, TMAX_E2E: '1' },
    timeout: 30_000,
  });

  try {
    const window = await app.firstWindow();
    // Time only the post-firstWindow restore phase: pty spawn parallelism is
    // what we're measuring, not Electron cold-start (which dominates total
    // launch time and varies wildly by machine).
    const start = Date.now();

    // Install a mutation observer as early as possible so we catch any
    // empty-state render that happens between window open and pane attach.
    // We can't time this perfectly (the renderer may have rendered before
    // we wired up the observer) but it catches the dominant case where
    // .empty-state stays mounted for 1+ seconds during serial pty spawn.
    await window.addInitScript(() => {
      (window as any).__sawEmptyState = false;
      const check = () => {
        if (document.querySelector('.empty-state')) {
          (window as any).__sawEmptyState = true;
        }
      };
      // Run at every tick as the React tree mounts.
      const interval = setInterval(check, 8);
      const observer = new MutationObserver(check);
      // domcontentloaded may have already fired; observe whatever exists.
      const start = () => observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start, { once: true });
      // Stop after 30s to avoid leaks.
      setTimeout(() => { clearInterval(interval); observer.disconnect(); }, 30_000);
    });

    // Belt and braces: also poll from the test side.
    let sawEmptyStateFromOutside = false;
    const pollInterval = setInterval(async () => {
      try {
        const count = await window.locator('.empty-state').count();
        if (count > 0) sawEmptyStateFromOutside = true;
      } catch { /* window might be transitioning */ }
    }, 25);

    try {
      // Wait for all four panes to attach.
      await window.waitForFunction(
        () => document.querySelectorAll('.terminal-panel').length >= 4,
        null,
        { timeout: 15_000 },
      );
    } finally {
      clearInterval(pollInterval);
    }

    const restoreMs = Date.now() - start;

    const sawEmptyStateFromPage = await window.evaluate(() => (window as any).__sawEmptyState === true);

    // Sanity: the seeded session actually round-tripped into the store.
    const terminalCount = await window.evaluate(
      () => (window as any).__terminalStore?.getState().terminals.size ?? 0,
    );
    expect(terminalCount).toBeGreaterThanOrEqual(4);

    // The actual regression assertion: no empty-state flash during restore.
    expect({ sawEmptyStateFromPage, sawEmptyStateFromOutside, restoreMs })
      .toEqual(expect.objectContaining({ sawEmptyStateFromPage: false, sawEmptyStateFromOutside: false }));

    // Soft perf signal: wall-clock from firstWindow to all 4 panes attached.
    // Excludes Electron cold-start (varies by machine). On parallel pty
    // spawn this is dominated by ONE spawn time + xterm hydration; with
    // serial spawn it's 4x that. Budget is intentionally loose to avoid
    // flaking on contended boxes - regressing to fully serial would still
    // blow this on Windows.
    expect(restoreMs).toBeLessThan(6000);
  } finally {
    try { await app.close(); } catch { /* already closed */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('first launch with no saved session still shows the empty-state hero', async () => {
  // Inverse check: the loading indicator must not permanently replace the
  // empty state. With no session file present, after init completes (fast,
  // no panes to spawn) the empty-state hero should appear briefly before
  // the auto-spawn fallback creates the default terminal.
  //
  // We can't reliably observe the hero in flight (auto-spawn races it), so
  // this is a no-crash + ends-with-one-terminal smoke. The loading-indicator
  // logic is exercised; if it gets stuck the test fails on terminal-attach
  // timeout.
  const userDataDir = mkdtempSync(join(tmpdir(), 'tmax-e2e-fresh-'));
  const outDir = process.env.TMAX_E2E_OUT_DIR || 'out-e2e';
  const exePath = join(process.cwd(), outDir, 'tmax-win32-x64', 'tmax.exe');

  const app = await _electron.launch({
    executablePath: exePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, TMAX_E2E: '1' },
    timeout: 30_000,
  });

  try {
    const window = await app.firstWindow();
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    const count = await window.evaluate(
      () => (window as any).__terminalStore?.getState().terminals.size ?? 0,
    );
    expect(count).toBeGreaterThanOrEqual(1);
  } finally {
    try { await app.close(); } catch { /* already closed */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
