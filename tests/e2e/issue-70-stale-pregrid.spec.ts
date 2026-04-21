import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

async function getFocusedLeafMetrics(window: Page) {
  return window.evaluate(() => {
    const leaf = document.querySelector('.tiling-leaf:has(.terminal-panel.focused)');
    if (!leaf) return { found: false, width: 0, height: 0, visibility: '' };
    const rect = (leaf as HTMLElement).getBoundingClientRect();
    const style = getComputedStyle(leaf as HTMLElement);
    return {
      found: true,
      width: rect.width,
      height: rect.height,
      visibility: style.visibility,
    };
  });
}

function collectLeafIds(node: any, out: string[] = []): string[] {
  if (!node) return out;
  if (node.kind === 'leaf') { out.push(node.terminalId); return out; }
  if (node.kind === 'split') {
    collectLeafIds(node.first, out);
    collectLeafIds(node.second, out);
  }
  return out;
}

test('stale preGridRoot: focus → grid → add terminal → focus loses the new one', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Start in focus mode
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(400);
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 2,
      null, { timeout: 10_000 },
    );

    // Go focus → grid
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(400);
    let s = await getStoreState(window);
    expect(s.viewMode).toBe('focus');

    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(400);
    s = await getStoreState(window);
    expect(s.viewMode).toBe('grid');

    const preGridLeafIds = collectLeafIds(s.preGridRoot);
    const currentLeafIds = collectLeafIds(s.tilingRoot);

    // Now add a new terminal while in grid
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(500);
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 3,
      null, { timeout: 10_000 },
    );

    s = await getStoreState(window);
    const newTerminalId = s.terminalIds.find((id: string) => !currentLeafIds.includes(id));

    // Focus the new terminal
    const panels = await window.$$('.terminal-panel');
    expect(panels.length).toBeGreaterThanOrEqual(3);
    await panels[panels.length - 1].click();
    await window.waitForTimeout(300);

    s = await getStoreState(window);
    // If focus went to the newest terminal, continue; otherwise set it via keyboard nav
    expect(s.viewMode).toBe('grid');

    // Toggle to focus mode — this restores preGridRoot which is STALE (no new terminal)
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(500);

    s = await getStoreState(window);
    expect(s.viewMode).toBe('focus');

    const restoredLeafIds = collectLeafIds(s.tilingRoot);
    const focused = s.focused;

    console.log('preGridLeafIds:', preGridLeafIds);
    console.log('afterAdd currentLeafIds:', currentLeafIds);
    console.log('newTerminalId:', newTerminalId);
    console.log('focusedAfterFocusMode:', focused);
    console.log('restoredLeafIds:', restoredLeafIds);
    console.log('focusInRestoredTree:', focused && restoredLeafIds.includes(focused));

    const metrics = await getFocusedLeafMetrics(window);
    console.log('metrics:', metrics);

    // If focused terminal isn't in restored tree, the screen is blank → THIS IS THE BUG
    if (focused && !restoredLeafIds.includes(focused)) {
      console.log('!!! BUG REPRODUCED: focused terminal', focused, 'is not in restored tiling tree');
    }

    expect(metrics.found).toBe(true);
    expect(metrics.width).toBeGreaterThan(100);
  } finally {
    await close();
  }
});
