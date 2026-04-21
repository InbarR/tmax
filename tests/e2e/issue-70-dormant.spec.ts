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

test('stale preGridRoot after wakeFromDormant: focus mode leaves woken terminal invisible', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Default is grid. Create a 2nd terminal.
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(400);
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 2,
      null, { timeout: 10_000 },
    );

    // Go grid → focus → grid to populate preGridRoot with real data.
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(300);
    let s = await getStoreState(window);
    expect(s.viewMode).toBe('grid');

    const idA = s.terminalIds[0];
    const idB = s.terminalIds[1];
    const preGridAfterToggle = collectLeafIds(s.preGridRoot);
    expect(preGridAfterToggle).toEqual(expect.arrayContaining([idA, idB]));

    // Move terminal A to dormant (correctly removes from preGridRoot)
    await window.evaluate((id) => (window as any).__terminalStore.getState().moveToDormant(id), idA);
    await window.waitForTimeout(300);
    s = await getStoreState(window);
    expect(collectLeafIds(s.preGridRoot)).not.toContain(idA);

    // Wake A from dormant (BUG: preGridRoot is NOT updated to add A back)
    await window.evaluate((id) => (window as any).__terminalStore.getState().wakeFromDormant(id), idA);
    await window.waitForTimeout(300);
    s = await getStoreState(window);
    const tilingIds = collectLeafIds(s.tilingRoot);
    const preIds = collectLeafIds(s.preGridRoot);

    console.log('after wake:');
    console.log('  tilingRoot leaves:', tilingIds);
    console.log('  preGridRoot leaves:', preIds);
    console.log('  focused:', s.focused);

    // Bug signature: preGridRoot is stale (missing the woken terminal)
    expect(tilingIds).toContain(idA);
    const preGridIsStale = !preIds.includes(idA);
    console.log('preGridRoot stale (missing woken terminal)?', preGridIsStale);

    // Toggle to focus mode — this uses preGridRoot as restored tree
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(500);
    s = await getStoreState(window);
    expect(s.viewMode).toBe('focus');

    const focusedAfter = s.focused;
    const restoredIds = collectLeafIds(s.tilingRoot);
    console.log('after focus mode:');
    console.log('  restored tilingRoot leaves:', restoredIds);
    console.log('  focused:', focusedAfter);
    console.log('  focused in restored tree?', restoredIds.includes(focusedAfter));

    const metrics = await getFocusedLeafMetrics(window);
    console.log('  focused-leaf metrics:', metrics);

    if (focusedAfter && !restoredIds.includes(focusedAfter)) {
      console.log('!!! BUG REPRODUCED: focused terminal missing from restored tree → blank focus mode');
    }

    // The real assertion for the bug: focused terminal must be in the restored tree
    expect(restoredIds).toContain(focusedAfter);
    expect(metrics.found).toBe(true);
    expect(metrics.width).toBeGreaterThan(100);
  } finally {
    await close();
  }
});
