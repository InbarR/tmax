// TASK-159: a detached pane opens in a minimal window (DetachedApp) that
// historically had no title bar and no way to reattach without relying on
// the (possibly hidden) main-window tab bar. The detached window now renders
// its own title/menu bar with a Reattach control. This test detaches a pane
// and asserts the new window exposes that chrome.
import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

test('TASK-159: detached window shows a title bar with a Reattach control', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(700);

    // Detach the focused pane -> opens a new BrowserWindow running DetachedApp.
    await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.focusedTerminalId ?? [...s.terminals.keys()][0];
      await s.detachTerminal(id);
    });

    // Wait for the second window (the detached one) to appear.
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    const detached = app.windows().find((w) => w !== window)!;
    expect(detached, 'a detached window should have opened').toBeTruthy();

    // The detached window renders its own title bar + xterm, not the main app.
    await detached.waitForSelector('.detached-titlebar', { timeout: 15_000 });
    await detached.waitForSelector('.detached-terminal .xterm-screen', { timeout: 15_000 });

    // Title text is present (defaults to a label until the shell reports one).
    const titleText = await detached.textContent('.detached-title-text');
    expect((titleText ?? '').trim().length, 'title bar should show a non-empty title').toBeGreaterThan(0);

    // Reattach control exists and is clickable (not part of the OS drag region).
    const reattachBtn = detached.locator('.detached-reattach-btn');
    await expect(reattachBtn, 'detached window should expose a Reattach control').toBeVisible();

    // Clicking Reattach closes the detached window and drops the pane back.
    await reattachBtn.click();
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);
  } finally {
    await close();
  }
});
