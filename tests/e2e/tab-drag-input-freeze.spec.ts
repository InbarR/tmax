import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readDiagLog(userDataDir: string): string {
  const path = join(userDataDir, 'tmax-diag.log');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function findPtyWritesSince(log: string, marker: string, terminalId: string): string[] {
  const idx = log.lastIndexOf(marker);
  const tail = idx >= 0 ? log.slice(idx) : log;
  return tail.split(/\r?\n/).filter((l) => l.includes(' pty:write ') && l.includes(terminalId));
}

async function logMarker(window: Page, marker: string): Promise<void> {
  await window.evaluate((m: string) => (window as any).terminalAPI.diagLog(m), marker);
}

test('typing still works after dragging the focused tab to a new position', async ({}, testInfo) => {
  // Headless GitHub Actions windows-latest runners don't route keystrokes
  // into the Electron window reliably (focus sits outside the xterm canvas),
  // so the "before the drag" baseline already fails with 2 writes instead
  // of 11. This test stays valuable locally; skip it on CI until we can pin
  // down a reliable focus shim for the packaged app.
  testInfo.skip(!!process.env.CI, 'xterm canvas focus is unreliable on CI runners');

  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Create 3 terminals so we have tabs to drag between
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(300);
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 3,
      null, { timeout: 10_000 },
    );

    // Focus the first terminal and make sure we can type into it
    const panels = await window.$$('.terminal-panel');
    await panels[0].click();
    await window.waitForTimeout(300);
    const state1 = await getStoreState(window);
    const targetId = state1.focused;

    // Dump tab DOM to find drag handle
    const tabInfo = await window.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-terminal-id], .tab, .tabbar-tab, [class*="tab"]')]
        .map((el) => ({
          tag: el.tagName,
          cls: (el as HTMLElement).className,
          id: (el as HTMLElement).getAttribute('data-terminal-id') || '',
          rect: el.getBoundingClientRect(),
        }))
        .filter((e) => e.rect.width > 20 && e.rect.height > 15 && e.rect.height < 60);
      return tabs.slice(0, 8);
    });
    console.log('tab candidates:', tabInfo);

    // Type once before dragging, verify it reaches PTY
    const marker1 = `e2e:before:${Date.now()}`;
    await logMarker(window, marker1);
    await window.waitForTimeout(100);
    await window.keyboard.type('brianbefore');
    await window.waitForTimeout(300);

    const log1 = readDiagLog(userDataDir);
    const writesBefore = findPtyWritesSince(log1, marker1, targetId);
    console.log('writes before drag:', writesBefore.length);
    expect(writesBefore.length).toBeGreaterThan(5);

    // Drag the first tab to a different position (simulate dragging tab[0] onto tab[2])
    // Find tab elements by searching for elements that contain data-tab-id or similar.
    const dragResult = await window.evaluate(() => {
      // Look for tab elements in the tab bar
      const tabBar = document.querySelector('.tab-bar, [class*="tab-bar"], [class*="TabBar"]');
      const tabs = tabBar ? [...tabBar.querySelectorAll('[class*="tab"]')] : [];
      const filtered = tabs.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.width > 30 && r.height > 15 && r.height < 60;
      });
      return {
        count: filtered.length,
        rects: filtered.slice(0, 4).map((t) => {
          const r = t.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, cls: (t as HTMLElement).className };
        }),
      };
    });
    console.log('drag candidates:', dragResult);

    if (dragResult.rects.length >= 3) {
      const from = dragResult.rects[0];
      const to = dragResult.rects[2];
      await window.mouse.move(from.x, from.y);
      await window.mouse.down();
      await window.waitForTimeout(100);
      // Multiple steps to trigger dnd-kit
      await window.mouse.move(from.x + 10, from.y, { steps: 5 });
      await window.waitForTimeout(50);
      await window.mouse.move(to.x, to.y, { steps: 15 });
      await window.waitForTimeout(200);
      await window.mouse.up();
      await window.waitForTimeout(500);

      // After drop, try to type into the same terminal. Does it still work?
      const marker2 = `e2e:after:${Date.now()}`;
      await logMarker(window, marker2);
      await window.waitForTimeout(100);
      await window.keyboard.type('brianafter');
      await window.waitForTimeout(400);

      const log2 = readDiagLog(userDataDir);
      const writesAfter = findPtyWritesSince(log2, marker2, targetId);
      console.log('writes after drag (target terminal):', writesAfter.length);
      console.log('sample:', writesAfter.slice(0, 3));

      // The bug: writesAfter will be 0 or near-0 because input is frozen.
      // The fix: writesAfter should be ~10 (one per char of "brianafter").
      expect(writesAfter.length).toBeGreaterThanOrEqual(5);
    } else {
      test.fail(true, 'Could not find tabs to drag');
    }
  } finally {
    await close();
  }
});
