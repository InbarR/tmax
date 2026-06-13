// TASK-158: text selection in a live pane was lost the moment a second pane
// opened. Root cause: opening the first split flips the layout root from a
// leaf to a split node, which moved the existing pane's TerminalPanel to a
// deeper DOM path and made React unmount+remount it - recreating xterm and
// wiping the live selection. The fix mounts each pane's TerminalPanel once
// into a stable per-terminal host node (via a portal), so tree reshapes no
// longer remount xterm.
import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

test('TASK-158: selection in a pane survives opening another pane', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Tag the first pane's live xterm instance + DOM node, then write a line.
    const id = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const tid = s.focusedTerminalId ?? [...s.terminals.keys()][0];
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      // Identity markers: a remount creates a brand-new Terminal / DOM node
      // that won't carry these.
      if (term) (term as any).__tmaxSelectionProbe = 'pane-1';
      term?.write('SELECTION_SURVIVES_158\r\n');
      const screen = document.querySelector(`[data-terminal-id="${tid}"] .xterm-screen`) as HTMLElement | null;
      if (screen) screen.dataset.tmaxProbe = 'pane-1';
      return tid as string;
    });
    await window.waitForTimeout(300);

    // Select everything (covers the written line) so there is a live selection.
    const setup = await window.evaluate((tid: string) => {
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      if (!term) return { ok: false } as any;
      term.selectAll();
      return { ok: true, hadSelection: term.hasSelection(), selText: term.getSelection() };
    }, id);
    expect(setup.ok, 'first pane xterm should be registered').toBe(true);
    expect(setup.hadSelection, 'selection should exist before split').toBe(true);
    expect(setup.selText, 'selection should cover the written line before split').toContain('SELECTION_SURVIVES_158');

    // Open another pane - this is the action that used to break selection by
    // remounting the original pane.
    await window.evaluate(() => (window as any).__terminalStore.getState().createTerminal());
    await window.waitForFunction(
      () => (window as any).__terminalStore.getState().terminals.size >= 2,
      null,
      { timeout: 15_000 },
    );
    // Two panes are now mounted in the DOM.
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 2,
      null,
      { timeout: 15_000 },
    );
    await window.waitForTimeout(500);

    // The original pane's xterm must be the SAME instance + DOM node (not
    // remounted), mounted into its stable host, and must still hold a live
    // selection. (We don't assert the exact selected glyphs: a live shell
    // legitimately repaints its buffer on the resize that accompanies a
    // split, just like Windows Terminal - what matters is the selection and
    // the xterm instance survive.)
    const after = await window.evaluate((tid: string) => {
      const term = (window as any).__getTerminalEntry(tid)?.terminal;
      const panelEl = document.querySelector(`[data-terminal-id="${tid}"]`) as HTMLElement | null;
      const screenEl = panelEl?.querySelector('.xterm-screen') as HTMLElement | null;
      return {
        registered: !!term,
        sameInstance: (term as any)?.__tmaxSelectionProbe === 'pane-1',
        sameDomNode: screenEl?.dataset.tmaxProbe === 'pane-1',
        panelInsidePaneHost: !!panelEl?.closest('.pane-host'),
        hasSelection: term?.hasSelection() ?? false,
      };
    }, id);

    expect(after.registered, 'original pane still registered after split').toBe(true);
    expect(after.sameInstance, 'original xterm instance must be preserved across the split (not remounted)').toBe(true);
    expect(after.sameDomNode, 'original xterm DOM node must be preserved across the split').toBe(true);
    expect(after.panelInsidePaneHost, 'pane should be mounted into its stable host node').toBe(true);
    expect(after.hasSelection, 'selection must survive opening another pane').toBe(true);
  } finally {
    await close();
  }
});
