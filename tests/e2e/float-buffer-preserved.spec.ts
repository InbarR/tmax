import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

// Regression for PR 76 / "moving a pane between tiled and floating modes
// blanks the content". TerminalPanel unmounts when a pane changes mode, and
// xterm's Terminal.dispose() drops the buffer; the fix snapshots the buffer
// to an in-memory cache via @xterm/addon-serialize and restores it on the
// remount that follows the mode change.
//
// This test writes a unique sentinel directly into the xterm buffer, moves
// the pane to floating, asserts the sentinel survived, then moves it back to
// tiled and asserts it still survived.

const SENTINEL = `buffer-preserved-needle-${Math.random().toString(36).slice(2, 10)}`;

async function bufferIncludes(window: Page, terminalId: string, needle: string): Promise<boolean> {
  return window.evaluate(([id, n]) => {
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return false;
    const buf = entry.terminal.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line && line.translateToString(true).includes(n)) return true;
    }
    return false;
  }, [terminalId, needle] as const);
}

async function writeToBuffer(window: Page, terminalId: string, text: string): Promise<void> {
  await window.evaluate(([id, t]) => {
    return new Promise<void>((resolve) => {
      const entry = (window as any).__getTerminalEntry(id);
      if (!entry) { resolve(); return; }
      entry.terminal.write(t, () => resolve());
    });
  }, [terminalId, text] as const);
}

test('terminal buffer content survives float ↔ dock mode changes', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    // Wait until the terminal is registered (TerminalPanel calls
    // registerTerminal in its mount effect, after launchTmax's __terminalStore
    // check has already passed).
    await window.waitForFunction(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      return id && !!(window as any).__getTerminalEntry?.(id);
    }, null, { timeout: 10_000 });

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];
    expect(terminalId).toBeTruthy();

    // Drop a clearly identifiable line into the buffer, then sanity-check it
    // shows up before any mode changes happen.
    await writeToBuffer(window, terminalId, `\r\n${SENTINEL}\r\n`);
    await window.waitForTimeout(150);
    expect(await bufferIncludes(window, terminalId, SENTINEL)).toBe(true);

    // tiled → floating. The store action updates layout, which unmounts the
    // tiled panel and mounts a floating one for the same terminal id.
    await window.evaluate((id: string) => {
      (window as any).__terminalStore.getState().moveToFloat(id);
    }, terminalId);
    // Allow React to re-render and the new TerminalPanel to mount + restore.
    await window.waitForFunction((id) => {
      const t = (window as any).__terminalStore.getState().terminals.get(id);
      return t?.mode === 'floating' && !!(window as any).__getTerminalEntry?.(id);
    }, terminalId, { timeout: 5_000 });
    await window.waitForTimeout(200);

    expect(await bufferIncludes(window, terminalId, SENTINEL)).toBe(true);

    // floating → tiled. Same dance in the other direction.
    await window.evaluate((id: string) => {
      (window as any).__terminalStore.getState().moveToTiling(id);
    }, terminalId);
    await window.waitForFunction((id) => {
      const t = (window as any).__terminalStore.getState().terminals.get(id);
      return t?.mode === 'tiled' && !!(window as any).__getTerminalEntry?.(id);
    }, terminalId, { timeout: 5_000 });
    await window.waitForTimeout(200);

    expect(await bufferIncludes(window, terminalId, SENTINEL)).toBe(true);
  } finally {
    await close();
  }
});
