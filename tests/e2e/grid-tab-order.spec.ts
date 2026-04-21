import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

function collectLeafIds(node: any, out: string[] = []): string[] {
  if (!node) return out;
  if (node.kind === 'leaf') { out.push(node.terminalId); return out; }
  if (node.kind === 'split') {
    collectLeafIds(node.first, out);
    collectLeafIds(node.second, out);
  }
  return out;
}

async function splitTerminalHoriz(window: Page): Promise<void> {
  // Ctrl+Alt+Right — split current pane horizontally
  await window.keyboard.press('Control+Alt+ArrowRight');
  await window.waitForTimeout(300);
}

test('grid view after focus→grid toggle lists panes in tab order', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Create 4 terminals via Ctrl+Shift+N
    for (let i = 0; i < 3; i++) {
      await window.keyboard.press('Control+Shift+n');
      await window.waitForTimeout(400);
    }
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 4,
      null, { timeout: 10_000 },
    );

    // Shuffle the layout: click the first terminal, split it horizontally to
    // deliberately make tree order != tab order.
    const panels = await window.$$('.terminal-panel');
    await panels[0].click();
    await window.waitForTimeout(200);
    await splitTerminalHoriz(window);

    // Tab order = store.terminals Map insertion order
    const state1 = await getStoreState(window);
    const tabOrder = state1.terminalIds;
    console.log('tabOrder:', tabOrder);

    // Go focus mode then back to grid
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(500);

    const state2 = await getStoreState(window);
    expect(state2.viewMode).toBe('grid');

    const gridLeafOrder = collectLeafIds(state2.tilingRoot);
    console.log('gridLeafOrder:', gridLeafOrder);

    // The grid leaves should match tab order (filtered to tiled ones).
    // Since we haven't dormanted/detached anything, all 4+ terminals are tiled.
    const tiledTabOrder = tabOrder.filter((id: string) => {
      // all terminals in state are still tiled by default
      return true;
    });

    expect(gridLeafOrder).toEqual(tiledTabOrder);
  } finally {
    await close();
  }
});
