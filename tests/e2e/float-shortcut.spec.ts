import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Pin Ctrl+Shift+U as the toggleFloat shortcut. User asked for a binding
// that mirrors Ctrl+Shift+F (focus mode) - press once to float the
// focused pane, press again to dock it back.

test('Ctrl+Shift+U floats the focused pane; pressing again restores it to the tile tree', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const id = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });

    // Sanity: pane starts tiled.
    const initialMode = await window.evaluate((tid) => {
      return (window as any).__terminalStore.getState().terminals.get(tid)?.mode;
    }, id);
    expect(initialMode).toBe('tiled');

    await window.keyboard.press('Control+Shift+u');
    await window.waitForTimeout(300);

    const afterFirstPress = await window.evaluate((tid) => {
      const s = (window as any).__terminalStore.getState();
      return {
        mode: s.terminals.get(tid)?.mode,
        floating: s.layout.floatingPanels.map((p: any) => p.terminalId),
      };
    }, id);
    expect(afterFirstPress.mode).toBe('floating');
    expect(afterFirstPress.floating).toContain(id);

    await window.keyboard.press('Control+Shift+u');
    await window.waitForTimeout(300);

    const afterSecondPress = await window.evaluate((tid) => {
      const s = (window as any).__terminalStore.getState();
      return {
        mode: s.terminals.get(tid)?.mode,
        floating: s.layout.floatingPanels.map((p: any) => p.terminalId),
      };
    }, id);
    expect(afterSecondPress.mode).toBe('tiled');
    expect(afterSecondPress.floating).not.toContain(id);
  } finally {
    await close();
  }
});
