import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

async function pressShortcut(window: Page, key: string): Promise<void> {
  await window.keyboard.press(key);
}

async function countVisibleTerminals(window: Page): Promise<number> {
  return window.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.terminal-panel'));
    return panels.filter((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el as HTMLElement);
      return rect.width > 10 && rect.height > 10 && style.visibility !== 'hidden';
    }).length;
  });
}

async function getFocusedLeafMetrics(window: Page): Promise<{
  found: boolean;
  width: number;
  height: number;
  visibility: string;
  hasXtermRows: boolean;
}> {
  return window.evaluate(() => {
    const leaf = document.querySelector('.tiling-leaf:has(.terminal-panel.focused)');
    if (!leaf) return { found: false, width: 0, height: 0, visibility: '', hasXtermRows: false };
    const rect = (leaf as HTMLElement).getBoundingClientRect();
    const style = getComputedStyle(leaf as HTMLElement);
    const rows = leaf.querySelector('.xterm-rows');
    return {
      found: true,
      width: rect.width,
      height: rect.height,
      visibility: style.visibility,
      hasXtermRows: !!rows && (rows as HTMLElement).childNodes.length > 0,
    };
  });
}

test.describe('Issue #70: focus mode blank terminal', () => {
  test('grid → focus mode keeps the focused terminal visible (2 terminals)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);

      await pressShortcut(window, 'Control+Shift+n');
      await window.waitForTimeout(800);
      await window.waitForFunction(
        () => document.querySelectorAll('.terminal-panel').length >= 2,
        null,
        { timeout: 10_000 },
      );

      let state = await getStoreState(window);
      expect(state.terminalIds.length).toBeGreaterThanOrEqual(2);
      expect(state.viewMode).toBe('grid');

      await pressShortcut(window, 'Control+Shift+f');
      await window.waitForTimeout(600);

      state = await getStoreState(window);
      expect(state.viewMode).toBe('focus');

      const visible = await countVisibleTerminals(window);
      expect(visible).toBeGreaterThan(0);

      const metrics = await getFocusedLeafMetrics(window);
      expect(metrics.found).toBe(true);
      expect(metrics.visibility).toBe('visible');
      expect(metrics.width).toBeGreaterThan(100);
      expect(metrics.height).toBeGreaterThan(100);
    } finally {
      await close();
    }
  });

  test('grid → focus → grid → focus on a different terminal', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);

      await pressShortcut(window, 'Control+Shift+n');
      await window.waitForTimeout(600);
      await pressShortcut(window, 'Control+Shift+n');
      await window.waitForTimeout(600);
      await window.waitForFunction(
        () => document.querySelectorAll('.terminal-panel').length >= 3,
        null,
        { timeout: 10_000 },
      );

      await pressShortcut(window, 'Control+Shift+f');
      await window.waitForTimeout(600);
      await pressShortcut(window, 'Control+Shift+f');
      await window.waitForTimeout(600);

      const panels = await window.$$('.terminal-panel');
      expect(panels.length).toBeGreaterThanOrEqual(3);
      await panels[0].click();
      await window.waitForTimeout(400);

      await pressShortcut(window, 'Control+Shift+f');
      await window.waitForTimeout(600);

      const state = await getStoreState(window);
      expect(state.viewMode).toBe('focus');

      const metrics = await getFocusedLeafMetrics(window);
      expect(metrics.found).toBe(true);
      expect(metrics.visibility).toBe('visible');
      expect(metrics.width).toBeGreaterThan(100);
    } finally {
      await close();
    }
  });
});
