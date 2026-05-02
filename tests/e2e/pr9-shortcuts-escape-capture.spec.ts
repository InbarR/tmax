import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Regression test for PR #9 — ShortcutsHelp uses capture phase for
// the Escape handler so it closes the overlay before the event
// propagates to xterm or other listeners.

test('PR #9: Escape closes the shortcuts help dialog', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    // Open shortcuts help via the store
    await window.evaluate(() => {
      (window as any).__terminalStore.setState({ showShortcuts: true });
    });

    // Verify the dialog is visible
    await window.waitForSelector('.shortcuts-backdrop', { timeout: 3_000 });
    const visible = await window.isVisible('.shortcuts-dialog');
    expect(visible).toBe(true);

    // Press Escape
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    // Verify the dialog closed
    const stillVisible = await window.$('.shortcuts-backdrop');
    expect(stillVisible).toBeNull();
  } finally {
    await close();
  }
});
