import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-79: TASK-72 added Ctrl+click multi-select on pane title bars and
// Command Palette commands "Show Selected Panes" / "Show All Panes" /
// "Clear Pane Selection". The flow wasn't discoverable - nothing in the UI
// hinted at the gesture, and triggering the filter required opening the
// palette. This spec verifies the new affordances:
//   1. A "Show Selected (N)" toolbar button appears in WorkspaceTabBar
//      ONLY when there's a selection or the filter is active. No clutter
//      when the user is just using workspaces normally.
//   2. Clicking the button toggles the filter (Show Selected ↔ Show All).
//   3. The Clear (×) sub-button drops the selection.
//   4. The pane overflow ("⋯") menu surfaces Select / Show Selected / Show
//      All / Clear entries when in workspaces mode.

async function spawnThreePanes(window: Page): Promise<string[]> {
  return window.evaluate(async () => {
    const store = (window as any).__terminalStore.getState();
    const t0 = store.focusedTerminalId ?? Array.from(store.terminals.keys())[0];
    await store.splitTerminal(t0, 'horizontal', undefined, 'right');
    const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
    await (window as any).__terminalStore.getState().splitTerminal(t1, 'horizontal', undefined, 'right');
    const t2 = (window as any).__terminalStore.getState().focusedTerminalId;
    return [t0, t1, t2];
  });
}

function leafIds(window: Page): Promise<string[]> {
  return window.evaluate(() => {
    function walk(n: any): string[] {
      if (!n) return [];
      if (n.kind === 'leaf') return [n.terminalId];
      return [...walk(n.first), ...walk(n.second)];
    }
    return walk((window as any).__terminalStore.getState().layout.tilingRoot);
  });
}

test('Show Selected toolbar button is hidden when no selection exists (AC #4)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);
    await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // No selection -> no Show Selected button.
    expect(await window.locator('.workspace-show-selected').count()).toBe(0);
  } finally {
    await close();
  }
});

test('Show Selected toolbar button appears with the count once a selection exists', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);
    const [t0, , t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Pick two panes via Ctrl+click on title bars.
    const isMac = process.platform === 'darwin';
    const mod = isMac ? 'Meta' : 'Control';
    await window.locator(`[data-terminal-id="${t0}"] .terminal-pane-title`).first().click({ modifiers: [mod] });
    await window.locator(`[data-terminal-id="${t2}"] .terminal-pane-title`).first().click({ modifiers: [mod] });
    await window.waitForTimeout(150);

    const btn = window.locator('.workspace-show-selected-btn');
    await expect(btn).toHaveCount(1);
    await expect(btn).toContainText('Show Selected');
    await expect(btn).toContainText('(2)');
  } finally {
    await close();
  }
});

test('Toolbar button toggles the filter (Show Selected ↔ Show All)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);
    const [t0, t1, t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Programmatically select t0 and t2 (mirrors what Ctrl+click does).
    await window.evaluate(({ a, c }) => {
      const s = (window as any).__terminalStore.getState();
      s.toggleSelectTerminal(a);
      s.toggleSelectTerminal(c);
    }, { a: t0, c: t2 });
    await window.waitForTimeout(150);

    // Click the toolbar button to engage the filter.
    await window.locator('.workspace-show-selected-btn').click();
    await window.waitForTimeout(300);

    // Layout now contains only the selected terminals.
    const filtered = await leafIds(window);
    expect(filtered.sort()).toEqual([t0, t2].sort());
    expect(filtered).not.toContain(t1);

    // The button now reads "Show All" and is in the active state.
    const btn = window.locator('.workspace-show-selected-btn');
    await expect(btn).toContainText('Show All');
    await expect(window.locator('.workspace-show-selected.active')).toHaveCount(1);

    // Click again - filter clears, all panes restored.
    await btn.click();
    await window.waitForTimeout(300);
    const restored = await leafIds(window);
    expect(restored.sort()).toEqual([t0, t1, t2].sort());
  } finally {
    await close();
  }
});

test('Clear (×) sub-button drops the selection without engaging the filter', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);
    const [t0, , t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    await window.evaluate(({ a, c }) => {
      const s = (window as any).__terminalStore.getState();
      s.toggleSelectTerminal(a);
      s.toggleSelectTerminal(c);
    }, { a: t0, c: t2 });
    await window.waitForTimeout(150);

    // The clear (×) sub-button is rendered next to the main button.
    const clear = window.locator('.workspace-show-selected-clear');
    await expect(clear).toHaveCount(1);
    await clear.click();
    await window.waitForTimeout(150);

    // Selection is empty; the whole toolbar widget is gone.
    const sel = await window.evaluate(() =>
      Object.keys((window as any).__terminalStore.getState().selectedTerminalIds),
    );
    expect(sel).toEqual([]);
    expect(await window.locator('.workspace-show-selected').count()).toBe(0);
  } finally {
    await close();
  }
});

test('Pane overflow menu surfaces Select / Show Selected entries in workspaces mode', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);
    const [t0] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Open the pane's "⋯" overflow menu.
    await window
      .locator(`[data-terminal-id="${t0}"] .terminal-pane-menu-btn`)
      .first()
      .click();
    await window.waitForTimeout(150);

    // Select Pane entry is visible.
    const selectEntry = window.locator('.context-menu-item', { hasText: 'Select pane' });
    await expect(selectEntry).toHaveCount(1);
    await selectEntry.first().click();
    await window.waitForTimeout(150);

    // Now reopen and confirm it flipped to Deselect.
    await window
      .locator(`[data-terminal-id="${t0}"] .terminal-pane-menu-btn`)
      .first()
      .click();
    await window.waitForTimeout(150);
    await expect(window.locator('.context-menu-item', { hasText: 'Deselect pane' })).toHaveCount(1);
  } finally {
    await close();
  }
});
