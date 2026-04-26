import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Pins two related fixes for the per-pane ⋯ menu:
//
//  1. The "Float pane" item toggles. When the pane is already floating,
//     the menu shows "Restore to grid" and clicking it puts the pane back
//     into the tiling tree.
//
//  2. Restoring uses tab-order placement: the pane re-enters the tiling
//     tree next to its tab-bar neighbour, not always at the far right
//     (which is what the old "insert after the last leaf" default did).

test('Float menu item toggles to Restore while floating, and clicking it returns the pane to the tiling tree', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Spawn 3 panes total - the first one is the focused launch pane; we
    // split twice to its right. Tab order: [t0, t1, t2].
    const ids = await window.evaluate(async () => {
      const store = (window as any).__terminalStore.getState();
      const t0 = store.focusedTerminalId ?? Array.from(store.terminals.keys())[0];
      await store.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      await (window as any).__terminalStore.getState().splitTerminal(t1, 'horizontal', undefined, 'right');
      const t2 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1, t2];
    });
    await window.waitForTimeout(800);
    expect(ids.length).toBe(3);
    const [t0, , t2] = ids;

    // Float t0 (the leftmost pane, which is also the FIRST tab).
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToFloat(id);
    }, t0);
    await window.waitForTimeout(400);

    const stateBefore = await window.evaluate((id) => {
      const s = (window as any).__terminalStore.getState();
      return {
        mode: s.terminals.get(id)?.mode,
        floatingIds: s.layout.floatingPanels.map((p: any) => p.terminalId),
      };
    }, t0);
    expect(stateBefore.mode).toBe('floating');
    expect(stateBefore.floatingIds).toContain(t0);

    // Now click the floating pane's ⋯ menu and verify the label says
    // "Restore", not "Float".
    await window.click(`.terminal-panel[data-terminal-id="${t0}"] .terminal-pane-menu-btn`);
    await window.waitForSelector('.pane-menu', { timeout: 3_000 });
    const restoreBtn = window.locator('.dormant-popover-item', { hasText: 'Restore to grid' });
    await expect(restoreBtn).toBeVisible({ timeout: 2_000 });
    const floatBtn = window.locator('.dormant-popover-item', { hasText: 'Float pane' });
    await expect(floatBtn).toHaveCount(0);

    // Click Restore. The pane should rejoin the tiling tree.
    await restoreBtn.click();
    await window.waitForTimeout(500);

    const stateAfter = await window.evaluate(({ id, t2id }) => {
      const s = (window as any).__terminalStore.getState();
      const inst = s.terminals.get(id);
      const tiledOrder = (function order(node: any): string[] {
        if (!node) return [];
        if (node.kind === 'leaf') return [node.terminalId];
        return [...order(node.first), ...order(node.second)];
      })(s.layout.tilingRoot);
      return {
        mode: inst?.mode,
        floatingIds: s.layout.floatingPanels.map((p: any) => p.terminalId),
        tiledOrder,
        // For the placement assertion: the restored pane should be at index 0
        // of the tiled order, since its tab is index 0 of the tab order and
        // its only tab-order neighbours that were tiled are to its right.
        myIdx: tiledOrder.indexOf(id),
        t2Idx: tiledOrder.indexOf(t2id),
      };
    }, { id: t0, t2id: t2 });

    expect(stateAfter.mode).toBe('tiled');
    expect(stateAfter.floatingIds).not.toContain(t0);
    // The user's actual ask: pane goes back where its tab is - first.
    // Tab order is [t0, t1, t2]; restoring t0 with t1, t2 already tiled
    // should slot it BEFORE both of them, i.e. tiledOrder[0] === t0.
    console.log('after-restore tiledOrder:', stateAfter.tiledOrder);
    expect(stateAfter.myIdx).toBe(0);
  } finally {
    await close();
  }
});
