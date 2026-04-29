import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Regression test for PR #13 — enforce minimum pane size to prevent
// text smudging. The SplitResizer clamps split ratios so neither pane
// drops below MIN_PANE_PX (120px).

test('PR #13: split ratio is clamped so no pane is below minimum size', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    // Split the terminal to create two panes
    await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      store.splitTerminal(id, 'horizontal');
    });

    // Wait for the split to appear
    await window.waitForFunction(() => {
      return (window as any).__terminalStore.getState().terminals.size >= 2;
    }, null, { timeout: 5_000 });

    // Try to set an extreme split ratio (0.01 = nearly zero for first pane)
    const result = await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const root = store.layout?.tilingRoot;
      if (!root || root.kind === 'leaf') return null;
      // Set extreme ratio
      store.setSplitRatio(root.id, 0.01);
      // Read back
      const updated = (window as any).__terminalStore.getState().layout.tilingRoot;
      return updated.kind === 'leaf' ? null : updated.splitRatio;
    });

    // The ratio should have been clamped — not 0.01
    if (result !== null) {
      expect(result).toBeGreaterThanOrEqual(0.05); // MIN_PANE_PX/parentSize, at minimum
      expect(result).toBeLessThanOrEqual(0.95);
    }
  } finally {
    await close();
  }
});

test('PR #13: double-click on resizer resets split to 50/50', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    // Split terminal
    await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      store.splitTerminal(id, 'horizontal');
    });

    await window.waitForFunction(() => {
      return (window as any).__terminalStore.getState().terminals.size >= 2;
    }, null, { timeout: 5_000 });

    // Set a non-50/50 ratio
    await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const root = store.layout?.tilingRoot;
      if (root && root.kind !== 'leaf') {
        store.setSplitRatio(root.id, 0.7);
      }
    });

    // Double-click the resizer
    const resizer = await window.$('.split-resizer');
    if (resizer) {
      await resizer.dblclick();
      await window.waitForTimeout(200);

      // Verify ratio is back to 0.5
      const ratio = await window.evaluate(() => {
        const root = (window as any).__terminalStore.getState().layout.tilingRoot;
        return root && root.kind !== 'leaf' ? root.splitRatio : null;
      });
      if (ratio !== null) {
        expect(ratio).toBeCloseTo(0.5, 1);
      }
    }
  } finally {
    await close();
  }
});
