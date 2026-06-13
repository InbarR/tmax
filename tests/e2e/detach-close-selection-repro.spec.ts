import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Repro (user, deterministic): open 2 panes, detach one, then CLOSE the
// detached window so it reattaches into the split view -> selection is now
// dead in BOTH panes. This probes what broke: the xterm selection model
// (selectAll/hasSelection), the DOM user-select CSS, or the panes/registry.
test('detach a pane then close the detached window: selection still works in both panes', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(700);

    // Two panes.
    await window.evaluate(() => (window as any).__terminalStore.getState().createTerminal());
    await window.waitForFunction(() => (window as any).__terminalStore.getState().terminals.size >= 2, null, { timeout: 15_000 });
    await window.waitForTimeout(400);

    const probe = () => window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const ids = [...s.terminals.keys()];
      const panes = ids.map((id: string) => {
        const entry = (window as any).getTerminalEntry?.(id) ?? (window as any).__getTerminalEntry?.(id);
        const term = entry?.terminal;
        let model: any = { registered: !!term };
        if (term) {
          try {
            term.write('SELME_' + id.slice(0, 4) + '\r\n');
            term.selectAll();
            model.hasSelection = term.hasSelection();
            model.selLen = (term.getSelection() || '').length;
            term.clearSelection();
          } catch (e: any) { model.error = String(e?.message || e); }
        }
        return { id: id.slice(0, 6), mode: s.terminals.get(id).mode, ...model };
      });
      const screens = [...document.querySelectorAll('.terminal-panel .xterm-screen')].map((el) => getComputedStyle(el as HTMLElement).userSelect);
      return {
        count: ids.length,
        bodyUserSelect: getComputedStyle(document.body).userSelect,
        domPanels: document.querySelectorAll('.terminal-panel').length,
        domScreens: document.querySelectorAll('.xterm-screen').length,
        screenUserSelect: screens,
        panes,
      };
    });

    const before = await probe();

    // Detach the focused pane.
    const detachedId = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.focusedTerminalId ?? [...s.terminals.keys()][0];
      await s.detachTerminal(id);
      return id as string;
    });
    await window.waitForTimeout(1200); // detached window opens

    // Close the detached window (the user's action) -> onDetachedClosed -> reattach.
    await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 1) wins[wins.length - 1].close();
    });
    await window.waitForTimeout(1500); // reattach + re-layout settles

    const after = await probe();

    // eslint-disable-next-line no-console
    console.log('\n=== BEFORE detach ===\n' + JSON.stringify(before, null, 1));
    // eslint-disable-next-line no-console
    console.log('\n=== AFTER detach+close (reattach) ===\n' + JSON.stringify(after, null, 1));

    // Both panes should still be selectable after reattach.
    for (const p of after.panes) {
      expect(p.registered, `pane ${p.id} still registered`).toBe(true);
      expect(p.hasSelection, `pane ${p.id} can select after reattach`).toBe(true);
    }
    for (const us of after.screenUserSelect) {
      expect(us, 'xterm-screen user-select must not be none').not.toBe('none');
    }
  } finally {
    await close();
  }
});
