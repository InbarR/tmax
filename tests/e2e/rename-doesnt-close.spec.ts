import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Repros: "when I rename in the pane and click, it still closes."
// While the rename input is open, clicking the status-dot / close-X area
// at the left of the title bar fires the close-pane handler. The user
// hits this when reaching for the rename input or trying to dismiss the
// rename mode. The fix: while renaming is active, the status-dot's
// close behavior is suppressed.

test('clicking the status dot / close-X while a rename input is open does NOT close the pane', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const id = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });

    // Force-set a title so the title bar renders. Brand-new dev panes
    // initialize their title from the first PTY output, which lags.
    await window.evaluate((tid) => {
      const store = (window as any).__terminalStore;
      const s = store.getState();
      const map = new Map(s.terminals);
      const inst = map.get(tid);
      map.set(tid, { ...inst, title: 'rename-test-pane' });
      store.setState({ terminals: map });
    }, id);
    await window.waitForSelector('.terminal-pane-title', { timeout: 3_000 });

    // Enter rename mode by double-clicking the title text.
    await window.dblclick('.terminal-pane-title-text');
    await window.waitForSelector('.pane-rename-input', { timeout: 3_000 });

    // Click the status dot. Without the fix, the pane-root's
    // onMouseDownCapture re-focuses xterm on the way in, which blurs the
    // rename input → React renders out the input → the click handler sees
    // !isRenamingPane and runs closeTerminal. The fix skips the xterm
    // refocus while a rename input is active, and the status-dot's
    // onMouseDown reads DOM (input still present) into a ref the click
    // handler then reads.
    await window.click('.status-dot-container');
    await window.waitForTimeout(300);

    // The terminal must still exist - the click should have been a no-op
    // (or at most ended the rename mode), not a close.
    const stillExists = await window.evaluate((tid) => {
      return (window as any).__terminalStore.getState().terminals.has(tid);
    }, id);
    expect(stillExists).toBe(true);
  } finally {
    await close();
  }
});
