import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-72: workspaces mode lost the multi-select interaction (Ctrl+click on
// individual tab headers) when the chip-based workspace bar replaced the
// per-terminal tabs. Restore the gesture, but bind it to the pane's title
// bar - panes are the new primary surface, and the title bar is outside
// the xterm screen so it does not steal terminal focus / text selection.
//
// Cross-platform: metaKey on Mac, ctrlKey on Windows/Linux. Playwright's
// keyboard.down('Control') / .down('Meta') handles modifier state without
// triggering platform-specific menu bindings.

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

test('Ctrl+click on a pane title bar toggles the pane in the multi-selection set', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Switch to workspaces tab mode (the regression context).
    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(200);

    const [t0, t1, t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Initially nothing is multi-selected.
    const beforeKeys = await window.evaluate(() =>
      Object.keys((window as any).__terminalStore.getState().selectedTerminalIds),
    );
    expect(beforeKeys).toEqual([]);

    // Ctrl/Cmd-click the title bars of t0 and t2. Use locator + modifiers
    // option so the click event fires with the platform-correct modifier.
    const isMac = process.platform === 'darwin';
    const mod = isMac ? 'Meta' : 'Control';
    const t0Title = window.locator(`[data-terminal-id="${t0}"] .terminal-pane-title`).first();
    const t2Title = window.locator(`[data-terminal-id="${t2}"] .terminal-pane-title`).first();
    await t0Title.click({ modifiers: [mod] });
    await t2Title.click({ modifiers: [mod] });
    await window.waitForTimeout(150);

    const afterKeys = await window.evaluate(() =>
      Object.keys((window as any).__terminalStore.getState().selectedTerminalIds).sort(),
    );
    expect(afterKeys).toEqual([t0, t2].sort());

    // Visual indicator: both panes carry .multi-selected; t1 does not.
    const classes = await window.evaluate(({ a, b, c }) => {
      const sel = (id: string) => document.querySelector(`[data-terminal-id="${id}"] .terminal-panel`) || document.querySelector(`.terminal-panel[data-terminal-id="${id}"]`);
      // .terminal-panel itself has the data-terminal-id attribute, so query directly.
      const pa = document.querySelector(`.terminal-panel[data-terminal-id="${a}"]`);
      const pb = document.querySelector(`.terminal-panel[data-terminal-id="${b}"]`);
      const pc = document.querySelector(`.terminal-panel[data-terminal-id="${c}"]`);
      return {
        a: pa?.className ?? '',
        b: pb?.className ?? '',
        c: pc?.className ?? '',
      };
    }, { a: t0, b: t1, c: t2 });
    expect(classes.a).toContain('multi-selected');
    expect(classes.b).not.toContain('multi-selected');
    expect(classes.c).toContain('multi-selected');

    // Ctrl-click again on t0 toggles it OFF.
    await t0Title.click({ modifiers: [mod] });
    await window.waitForTimeout(150);
    const finalKeys = await window.evaluate(() =>
      Object.keys((window as any).__terminalStore.getState().selectedTerminalIds),
    );
    expect(finalKeys).toEqual([t2]);
  } finally {
    await close();
  }
});

test('showSelectedPanes hides non-selected panes; showAllPanes restores them', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const [t0, t1, t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Confirm pre-condition: layout contains all three terminals.
    const before = await leafIds(window);
    expect(before.sort()).toEqual([t0, t1, t2].sort());

    // Programmatically pick t0 + t2 (mirrors what Ctrl+click does), then
    // run "Show selected panes".
    await window.evaluate(({ a, c }) => {
      const s = (window as any).__terminalStore.getState();
      s.toggleSelectTerminal(a);
      s.toggleSelectTerminal(c);
      s.showSelectedPanes();
    }, { a: t0, c: t2 });
    await window.waitForTimeout(300);

    // Layout now contains ONLY the selected terminals; t1 is hidden.
    const filtered = await leafIds(window);
    expect(filtered.sort()).toEqual([t0, t2].sort());
    expect(filtered).not.toContain(t1);

    // Selection persists so the visual indicator stays visible while
    // the filter is on - the user can tell which panes are queued.
    const stillSelected = await window.evaluate(() =>
      Object.keys((window as any).__terminalStore.getState().selectedTerminalIds).sort(),
    );
    expect(stillSelected).toEqual([t0, t2].sort());

    // Show all - layout restores all three terminals.
    await window.evaluate(() => (window as any).__terminalStore.getState().showAllPanes());
    await window.waitForTimeout(300);
    const restored = await leafIds(window);
    expect(restored.sort()).toEqual([t0, t1, t2].sort());

    // viewMode is back out of grid (showAllPanes maps grid -> focus).
    const vm = await window.evaluate(() => (window as any).__terminalStore.getState().viewMode);
    expect(vm).not.toBe('grid');
  } finally {
    await close();
  }
});

test('selection is cleared when switching workspaces (no leak across workspaces)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Workspaces mode + a second workspace.
    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    const wsA = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);
    const [t0] = await spawnThreePanes(window);

    // Select something in workspace A.
    await window.evaluate((id) => (window as any).__terminalStore.getState().toggleSelectTerminal(id), t0);
    expect(
      await window.evaluate(() => Object.keys((window as any).__terminalStore.getState().selectedTerminalIds).length),
    ).toBe(1);

    // Create + switch to workspace B - selection should clear.
    const wsB = await window.evaluate(() => (window as any).__terminalStore.getState().createWorkspace());
    await window.waitForTimeout(200);
    await window.evaluate((id) => (window as any).__terminalStore.getState().setActiveWorkspace(id), wsB);
    await window.waitForTimeout(200);
    expect(
      await window.evaluate(() => Object.keys((window as any).__terminalStore.getState().selectedTerminalIds).length),
    ).toBe(0);

    // Switching back to A also leaves selection clear (it's cleared on
    // the OUT side of every switch, not preserved per-workspace).
    await window.evaluate((id) => (window as any).__terminalStore.getState().setActiveWorkspace(id), wsA);
    await window.waitForTimeout(200);
    expect(
      await window.evaluate(() => Object.keys((window as any).__terminalStore.getState().selectedTerminalIds).length),
    ).toBe(0);
  } finally {
    await close();
  }
});

test('showSelectedPanes is a no-op when fewer than 2 panes are selected', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const [t0, t1, t2] = await spawnThreePanes(window);
    await window.waitForTimeout(300);

    // Select just one pane, then try to filter.
    await window.evaluate((id) => (window as any).__terminalStore.getState().toggleSelectTerminal(id), t0);
    await window.evaluate(() => (window as any).__terminalStore.getState().showSelectedPanes());
    await window.waitForTimeout(150);

    // Layout still contains all three - the no-op guard kicked in.
    const ids = await leafIds(window);
    expect(ids.sort()).toEqual([t0, t1, t2].sort());
    const vm = await window.evaluate(() => (window as any).__terminalStore.getState().viewMode);
    expect(vm).not.toBe('grid');
  } finally {
    await close();
  }
});
