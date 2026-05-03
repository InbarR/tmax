import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-78: per-pane "Move to workspace ..." action. Lets the user re-home an
// existing pane into a different workspace without recreating it. Surfaced
// in the per-pane overflow menu and the Command Palette. The PTY must keep
// running through the move (cwd / scrollback / process all survive).
//
// Cross-platform: the action is keyboard-shortcut-free, so no modifier
// reliance. The Command Palette is opened via store toggle (not a key chord)
// to avoid platform-specific menu bindings.

async function setWorkspacesMode(window: Page) {
  await window.evaluate(() =>
    (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }),
  );
  await window.waitForTimeout(150);
}

async function getActiveWorkspaceLeafIds(window: Page): Promise<string[]> {
  return window.evaluate(() => {
    function walk(n: any): string[] {
      if (!n) return [];
      if (n.kind === 'leaf') return [n.terminalId];
      return [...walk(n.first), ...walk(n.second)];
    }
    return walk((window as any).__terminalStore.getState().layout.tilingRoot);
  });
}

async function getWorkspaceLeafIds(window: Page, wsId: string): Promise<string[]> {
  return window.evaluate((id) => {
    function walk(n: any): string[] {
      if (!n) return [];
      if (n.kind === 'leaf') return [n.terminalId];
      return [...walk(n.first), ...walk(n.second)];
    }
    const ws = (window as any).__terminalStore.getState().workspaces.get(id);
    return walk(ws?.layout?.tilingRoot ?? null);
  }, wsId);
}

test('movePaneToWorkspace re-homes a pane and follows it when the moved pane was focused', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await setWorkspacesMode(window);

    // Capture the source workspace + a starting terminal in it.
    const { sourceWsId, t0 } = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const t0 = s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
      return { sourceWsId: s.activeWorkspaceId, t0 };
    });

    // Add a second pane to the source workspace so that moving t0 leaves
    // something behind (verifies the source-side removeLeaf branch).
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .splitTerminal(id, 'horizontal', undefined, 'right'), t0);
    await window.waitForTimeout(200);
    const t1 = await window.evaluate(() =>
      (window as any).__terminalStore.getState().focusedTerminalId,
    );

    // Create a fresh destination workspace + a pane in it (so we can check
    // that the moved pane is appended to the right of the existing leaf).
    const destWsId = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.createWorkspace('Dest');
    });
    await window.evaluate(() => (window as any).__terminalStore.getState().createTerminal());
    await window.waitForTimeout(300);
    const destOriginal = await window.evaluate(() =>
      (window as any).__terminalStore.getState().focusedTerminalId,
    );

    // Switch back to source so we can move the focused pane t0.
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .setActiveWorkspace(id), sourceWsId);
    await window.waitForTimeout(200);
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .setFocus(id), t0);
    await window.waitForTimeout(100);

    // Snapshot the moved terminal's PTY pid before the move - it must be the
    // same after (no PTY restart).
    const pidBefore = await window.evaluate((id) =>
      (window as any).__terminalStore.getState().terminals.get(id)?.pid, t0);

    // Perform the move.
    await window.evaluate(({ tid, dest }) => (window as any).__terminalStore
      .getState().movePaneToWorkspace(tid, dest), { tid: t0, dest: destWsId });
    await window.waitForTimeout(200);

    // Active workspace follows the focused pane.
    const newActive = await window.evaluate(() =>
      (window as any).__terminalStore.getState().activeWorkspaceId);
    expect(newActive).toBe(destWsId);

    // t0 lives in dest now; t1 stays in source.
    const sourceLeaves = await getWorkspaceLeafIds(window, sourceWsId);
    const destLeaves = await getWorkspaceLeafIds(window, destWsId);
    expect(sourceLeaves).toEqual([t1]);
    expect(destLeaves).toEqual([destOriginal, t0]);

    // workspaceId field on the terminal updated.
    const wsIdAfter = await window.evaluate((id) =>
      (window as any).__terminalStore.getState().terminals.get(id)?.workspaceId, t0);
    expect(wsIdAfter).toBe(destWsId);

    // PTY survived the move (same pid).
    const pidAfter = await window.evaluate((id) =>
      (window as any).__terminalStore.getState().terminals.get(id)?.pid, t0);
    expect(pidAfter).toBe(pidBefore);
  } finally {
    await close();
  }
});

test('movePaneToWorkspace stays put when the moved pane was not focused', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await setWorkspacesMode(window);

    const sourceWsId = await window.evaluate(() =>
      (window as any).__terminalStore.getState().activeWorkspaceId);
    const t0 = await window.evaluate(() =>
      (window as any).__terminalStore.getState().focusedTerminalId);

    // Add a second pane in source and focus it (so t0 is NOT focused when we
    // move it).
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .splitTerminal(id, 'horizontal', undefined, 'right'), t0);
    await window.waitForTimeout(200);
    const t1 = await window.evaluate(() =>
      (window as any).__terminalStore.getState().focusedTerminalId);
    // Sanity: focused is t1, not t0.
    expect(t1).not.toBe(t0);

    const destWsId = await window.evaluate(() =>
      (window as any).__terminalStore.getState().createWorkspace('Dest'));
    // Switch back to source - createWorkspace activates the new ws.
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .setActiveWorkspace(id), sourceWsId);
    await window.waitForTimeout(150);
    await window.evaluate((id) => (window as any).__terminalStore.getState()
      .setFocus(id), t1);
    await window.waitForTimeout(100);

    // Move t0 (NOT focused) to dest. Active workspace must stay at source.
    await window.evaluate(({ tid, dest }) => (window as any).__terminalStore
      .getState().movePaneToWorkspace(tid, dest), { tid: t0, dest: destWsId });
    await window.waitForTimeout(150);

    const activeAfter = await window.evaluate(() =>
      (window as any).__terminalStore.getState().activeWorkspaceId);
    expect(activeAfter).toBe(sourceWsId);

    // t0 still has its workspaceId updated - just we didn't follow.
    const wsIdAfter = await window.evaluate((id) =>
      (window as any).__terminalStore.getState().terminals.get(id)?.workspaceId, t0);
    expect(wsIdAfter).toBe(destWsId);

    // Visible (top-level) layout shows only t1 now.
    const visible = await getActiveWorkspaceLeafIds(window);
    expect(visible).toEqual([t1]);
  } finally {
    await close();
  }
});

test('overflow menu surfaces "Move to workspace" submenu when 2+ workspaces exist', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await setWorkspacesMode(window);

    // Initially only one workspace - the submenu trigger should NOT appear.
    const t0 = await window.evaluate(() =>
      (window as any).__terminalStore.getState().focusedTerminalId);
    const trigger0 = window.locator(`[data-terminal-id="${t0}"] .terminal-pane-menu-btn`).first();
    await trigger0.click();
    // The "Move to workspace" entry shouldn't render with a single workspace.
    await expect(window.locator('.context-menu .context-menu-item:has-text("Move to workspace")')).toHaveCount(0);
    // Close menu by clicking the backdrop.
    await window.locator('.pane-menu-backdrop').first().click();
    await window.waitForTimeout(100);

    // Add a second workspace; now the submenu trigger should appear.
    await window.evaluate(() =>
      (window as any).__terminalStore.getState().createWorkspace('Other'));
    await window.waitForTimeout(200);
    // Switch back to t0's workspace so the trigger button is visible on it.
    await window.evaluate((id) => {
      const s = (window as any).__terminalStore.getState();
      const inst = s.terminals.get(id);
      s.setActiveWorkspace(inst.workspaceId ?? s.activeWorkspaceId);
    }, t0);
    await window.waitForTimeout(150);

    const trigger1 = window.locator(`[data-terminal-id="${t0}"] .terminal-pane-menu-btn`).first();
    await trigger1.click();
    await expect(window.locator('.context-menu .context-menu-item:has-text("Move to workspace")')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('Command Palette exposes "Move pane to workspace: <name>" entries', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    await setWorkspacesMode(window);

    // Create a second workspace named "Side Quest". The palette should
    // generate a "Move pane to workspace: Side Quest" command for the
    // focused pane.
    await window.evaluate(() =>
      (window as any).__terminalStore.getState().createWorkspace('Side Quest'));
    await window.waitForTimeout(150);
    // Make sure a pane is focused on the original workspace.
    await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      const ids = [...s.workspaces.keys()];
      // Switch to the first workspace (not the new one).
      s.setActiveWorkspace(ids[0]);
      const t = [...s.terminals.values()].find((x: any) => x.workspaceId === ids[0]);
      if (t) s.setFocus((t as any).id);
    });
    await window.waitForTimeout(150);

    // Open the palette via store action.
    await window.evaluate(() =>
      (window as any).__terminalStore.getState().toggleCommandPalette());
    await window.waitForSelector('.palette-input', { timeout: 5_000 });
    await window.locator('.palette-input').fill('Move pane');
    await window.waitForTimeout(150);

    // The palette should list a Move-to-Side-Quest entry.
    await expect(
      window.locator('.palette-item:has-text("Move pane to workspace: Side Quest")'),
    ).toHaveCount(1);
  } finally {
    await close();
  }
});
