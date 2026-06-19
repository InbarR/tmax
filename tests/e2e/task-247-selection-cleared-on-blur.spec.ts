// TASK-247: a selection a user was "done with" reappeared after minimizing and
// restoring tmax. Root cause: a native/synthesized xterm selection persists in
// the model until the user clicks/types in the pane; on restore the
// visibilitychange fit() and the tab-tint refresh() re-render it, so it
// visually resurrects. Fix: clear any lingering selection when the OS window is
// minimized or loses focus (window 'blur' / document hidden). Explicit copy
// (Ctrl+C / right-click) already clears its own selection, so what survives to
// a blur is uncopied-via-clearing-path and safe to drop.
import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

test('TASK-247: a lingering selection is cleared on window blur so it cannot resurrect on restore', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Write a line and create a live selection covering it - the kind that
    // survives without being copied via a clearing path.
    const id = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const tid = s.focusedTerminalId ?? [...s.terminals.keys()][0];
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      term?.write('SELECTION_RESURRECT_247\r\n');
      return tid as string;
    });
    await window.waitForTimeout(300);

    const before = await window.evaluate((tid: string) => {
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      term?.selectAll();
      return { hadSelection: term?.hasSelection() ?? false };
    }, id);
    expect(before.hadSelection, 'a live selection should exist before blur').toBe(true);

    // Simulate the OS window losing focus (minimize / alt-tab away). This is
    // exactly the signal the fix listens for.
    await window.evaluate(() => window.dispatchEvent(new Event('blur')));
    await window.waitForTimeout(200);

    const after = await window.evaluate((tid: string) => {
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      return { hasSelection: term?.hasSelection() ?? false };
    }, id);
    expect(after.hasSelection, 'selection must be cleared on blur so it cannot resurrect on restore').toBe(false);

    // And a re-fit/refresh on restore (what visibilitychange does) must NOT
    // bring the selection back - the model is empty, so there is nothing to
    // re-render.
    const restored = await window.evaluate((tid: string) => {
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      term?.refresh(0, (term?.rows ?? 1) - 1);
      return { hasSelection: term?.hasSelection() ?? false };
    }, id);
    expect(restored.hasSelection, 'a refresh after restore must not resurrect the selection').toBe(false);
  } finally {
    await close();
  }
});
