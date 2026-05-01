import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-45: Playwright coverage for the workspaces polish work shipped in
// TASK-43. The polish round added per-workspace colorize, workspace
// color tint with precedence groupColor > workspaceColor > tabColor >
// defaultTabColor, an inline + on the active workspace chip that adds a
// pane to *that* workspace (vs. the outer + which creates a new
// workspace), and middle-click-to-close on workspace chips with the
// last-workspace guard preserved. These tests assert each behavior at
// the store level (and via the DOM where the user can actually see it)
// so a future regression is caught before the user does.

const MS_RED = '#F25022';
const MS_GREEN = '#7FBA00';

async function getStore(window: Page): Promise<any> {
  return window.evaluate(() => (window as any).__terminalStore.getState());
}

async function enableWorkspacesMode(window: Page) {
  await window.evaluate(async () => {
    const store = (window as any).__terminalStore.getState();
    await store.updateConfig({ tabMode: 'workspaces' });
  });
  // Wait for the workspace tab bar to render.
  await window.waitForSelector('.workspace-tab-bar', { timeout: 5_000 });
}

// `colorizeAllTabs` toggles. Force the "ON with colors assigned" state
// regardless of the saved config's autoColorTabs default. We do this by
// setting autoColorTabs=false directly then invoking the action so it
// runs the assignment branch.
async function forceColorizeOn(window: Page) {
  await window.evaluate(() => {
    const store = (window as any).__terminalStore;
    store.setState({ autoColorTabs: false });
    store.getState().colorizeAllTabs();
  });
}

test('per-workspace colorize: each workspaces first pane gets MS color #1 (TASK-45 AC #1)', async () => {
  // The bug we are guarding against: before TASK-43 the colorizer used
  // a single global counter, so a brand-new workspace's first pane would
  // be color #5 (Purple) just because workspace #1 already had 4 panes.
  // After the fix, each workspace colorizes from scratch.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await enableWorkspacesMode(window);

    // Fill workspace #1 with 4 panes, then create workspace #2 with
    // exactly 1 pane.
    await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      // Add 3 more panes to ws#1 so it has 4 total.
      await s.createTerminal();
      await s.createTerminal();
      await s.createTerminal();
    });
    await window.waitForTimeout(300);

    const wsBId = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.createWorkspace();
      await s.createTerminal();
      return id as string;
    });
    await window.waitForTimeout(300);

    // Now turn colorize on. Expect the first pane in ws#2 to get MS Red
    // (#F25022), NOT color #5 (Purple).
    await forceColorizeOn(window);
    await window.waitForTimeout(150);

    const tints = await window.evaluate((wsB: string) => {
      const s = (window as any).__terminalStore.getState();
      const byWs = new Map<string, string[]>();
      for (const [, t] of s.terminals as Map<string, any>) {
        const wsId = t.workspaceId ?? s.activeWorkspaceId;
        if (!byWs.has(wsId)) byWs.set(wsId, []);
        byWs.get(wsId)!.push(t.tabColor);
      }
      return { wsBColors: byWs.get(wsB) ?? [] };
    }, wsBId);

    expect(tints.wsBColors.length).toBe(1);
    expect(tints.wsBColors[0]).toBe(MS_RED);
  } finally {
    await close();
  }
});

test('workspace color overrides auto-colored pane tint (TASK-45 AC #2)', async () => {
  // Precedence is groupColor > workspaceColor > tabColor > default.
  // When colorize is on AND a workspace has an explicit color, the
  // workspace color should win for the visible tint of every pane in
  // that workspace.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await enableWorkspacesMode(window);

    // Colorize first so every pane has a tabColor.
    await forceColorizeOn(window);
    await window.waitForTimeout(150);

    // Set the active workspace's color to MS Green.
    await window.evaluate((color) => {
      const s = (window as any).__terminalStore.getState();
      s.setWorkspaceColor(s.activeWorkspaceId, color);
    }, MS_GREEN);
    await window.waitForTimeout(150);

    // The terminal-color-overlay's background uses bgTint + alpha '18'.
    // Browsers normalize the inline `background` shorthand to rgba, so
    // we compare the parsed RGB triple instead of the literal hex.
    const overlayBg = await window.evaluate(() => {
      const el = document.querySelector('.terminal-color-overlay') as HTMLElement | null;
      return el?.style.background ?? null;
    });
    expect(overlayBg).not.toBeNull();
    // #7FBA00 → rgb(127, 186, 0). Match by RGB triple to be normalization-proof.
    expect(overlayBg!.replace(/\s/g, '')).toMatch(/rgba?\(127,186,0/);

    // Sanity check: also verify the store state confirms the precedence
    // (workspaceColor present, tabColor still present but not used).
    const tabColors = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return [...(s.terminals as Map<string, any>).values()].map((t) => t.tabColor);
    });
    expect(tabColors.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  } finally {
    await close();
  }
});

test('inline + on active chip adds pane to same workspace, not a new ws (TASK-45 AC #3)', async () => {
  // Outer + creates a workspace; inline + on the active chip adds a
  // pane to that workspace. Pane counts in other workspaces must not
  // change.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await enableWorkspacesMode(window);

    // Capture initial state: 1 ws, N panes (usually 1).
    const wsAId = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);

    // Create a second workspace via the store action so we have a
    // baseline for "other workspaces" count.
    const wsBId = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.createWorkspace();
      await s.createTerminal();
      await s.createTerminal();
      return id as string;
    });
    await window.waitForTimeout(300);

    // Switch back to wsA so its inline + is the visible one.
    await window.evaluate((id) => (window as any).__terminalStore.getState().setActiveWorkspace(id), wsAId);
    await window.waitForTimeout(200);

    // Snapshot pane counts BEFORE the click.
    const before = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const counts: Record<string, number> = {};
      for (const [, t] of s.terminals as Map<string, any>) {
        const wsId = t.workspaceId ?? s.activeWorkspaceId;
        counts[wsId] = (counts[wsId] ?? 0) + 1;
      }
      return { counts, wsCount: s.workspaces.size };
    });

    // Click the inline + on the ACTIVE chip. Use a precise selector
    // scoped to the active tab so we never hit the outer + button.
    const inlinePlus = window.locator('.workspace-tab.active .workspace-tab-add-pane-inline');
    await expect(inlinePlus).toBeVisible();
    await inlinePlus.click();
    await window.waitForTimeout(400);

    const after = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const counts: Record<string, number> = {};
      for (const [, t] of s.terminals as Map<string, any>) {
        const wsId = t.workspaceId ?? s.activeWorkspaceId;
        counts[wsId] = (counts[wsId] ?? 0) + 1;
      }
      return { counts, wsCount: s.workspaces.size };
    });

    // Workspace count must NOT have changed (inline + is not outer +).
    expect(after.wsCount).toBe(before.wsCount);
    // Active workspace gained exactly one pane.
    expect(after.counts[wsAId]).toBe((before.counts[wsAId] ?? 0) + 1);
    // Other workspace's pane count is untouched.
    expect(after.counts[wsBId]).toBe(before.counts[wsBId]);
  } finally {
    await close();
  }
});

test('middle-click closes a workspace; last workspace cannot be closed (TASK-45 AC #4)', async () => {
  // Middle-click on a workspace chip closes it (and kills its panes).
  // The last-workspace guard means middle-clicking the only remaining
  // workspace is a no-op.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await enableWorkspacesMode(window);

    // Create a 2nd workspace so we have 2 chips.
    const wsBId = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.createWorkspace();
      await s.createTerminal();
      return id as string;
    });
    await window.waitForTimeout(300);

    expect(await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size)).toBe(2);

    // Middle-click the wsB chip. Playwright's mouse.down/up with
    // button:'middle' fires onMouseDown with e.button === 1 which is
    // what the component listens for.
    const wsBChip = window.locator(`.workspace-tab[data-workspace-id="${wsBId}"]`);
    await expect(wsBChip).toBeVisible();
    const box = await wsBChip.boundingBox();
    expect(box).not.toBeNull();
    await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await window.mouse.down({ button: 'middle' });
    await window.mouse.up({ button: 'middle' });
    await window.waitForTimeout(400);

    // wsB is gone.
    const wsBStillThere = await window.evaluate((id) => (window as any).__terminalStore.getState().workspaces.has(id), wsBId);
    const remainingCount = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    expect(remainingCount).toBe(1);
    expect(wsBStillThere).toBe(false);

    // Now try to middle-click the only remaining chip. The
    // last-workspace guard must keep us at >= 1 workspace.
    const remainingChip = window.locator('.workspace-tab').first();
    await expect(remainingChip).toBeVisible();
    const box2 = await remainingChip.boundingBox();
    expect(box2).not.toBeNull();
    await window.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2);
    await window.mouse.down({ button: 'middle' });
    await window.mouse.up({ button: 'middle' });
    await window.waitForTimeout(400);

    const afterSecondClose = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    expect(afterSecondClose).toBeGreaterThanOrEqual(1);
  } finally {
    await close();
  }
});
