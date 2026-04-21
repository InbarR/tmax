import { test, expect } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

test('tmax launches, default terminal spawns, store is exposed', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    const state = await getStoreState(window);
    expect(state).not.toBeNull();
    expect(state.viewMode).toBe('grid');
    expect(state.terminalIds.length).toBeGreaterThan(0);
    expect(state.focused).toBe(state.terminalIds[0]);
  } finally {
    await close();
  }
});
