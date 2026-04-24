import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function terminalCount(window: Page): Promise<number> {
  return window.evaluate(() => {
    const store = (window as any).__terminalStore;
    return store.getState().terminals.size as number;
  });
}

test('Ctrl+T creates a new terminal', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const before = await terminalCount(window);
    expect(before).toBeGreaterThan(0);

    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      (n) => ((window as any).__terminalStore.getState().terminals.size as number) > n,
      before,
      { timeout: 5_000 },
    );

    const after = await terminalCount(window);
    expect(after).toBe(before + 1);
  } finally {
    await close();
  }
});

test('Ctrl+W closes the focused terminal', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Create a second terminal so Ctrl+W has something to close without exiting the app
    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      () => ((window as any).__terminalStore.getState().terminals.size as number) >= 2,
      null,
      { timeout: 5_000 },
    );
    const before = await terminalCount(window);
    expect(before).toBe(2);

    await window.keyboard.press('Control+w');
    await window.waitForFunction(
      (n) => ((window as any).__terminalStore.getState().terminals.size as number) < n,
      before,
      { timeout: 5_000 },
    );

    const after = await terminalCount(window);
    expect(after).toBe(before - 1);
  } finally {
    await close();
  }
});

test('legacy Ctrl+Shift+N / Ctrl+Shift+W still work', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const initial = await terminalCount(window);

    await window.keyboard.press('Control+Shift+n');
    await window.waitForFunction(
      (n) => ((window as any).__terminalStore.getState().terminals.size as number) > n,
      initial,
      { timeout: 5_000 },
    );
    const afterCreate = await terminalCount(window);
    expect(afterCreate).toBe(initial + 1);

    await window.keyboard.press('Control+Shift+w');
    await window.waitForFunction(
      (n) => ((window as any).__terminalStore.getState().terminals.size as number) < n,
      afterCreate,
      { timeout: 5_000 },
    );
    const afterClose = await terminalCount(window);
    expect(afterClose).toBe(afterCreate - 1);
  } finally {
    await close();
  }
});
