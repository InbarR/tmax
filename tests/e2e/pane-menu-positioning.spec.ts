import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Repros the "click ⋯ button does nothing" bug. The menu is rendered, but
// `.terminal-panel` has `contain: layout style` which makes it a containing
// block for `position: fixed` descendants. The menu's right/top coordinates
// are computed against window.innerWidth, but the browser positions them
// relative to .terminal-panel's box - landing far off-screen.
//
// The test passes if:
//   1. The menu DOM node exists after the click
//   2. Its bounding rect is fully inside the viewport (visible to the user)

async function clickAndDiag(window: any) {
  await window.hover('.terminal-pane-menu-btn:visible');
  await window.waitForTimeout(100);
  await window.click('.terminal-pane-menu-btn:visible');
  await window.waitForTimeout(200);

  return window.evaluate(() => {
    const menu = document.querySelector('.pane-menu') as HTMLElement | null;
    const panel = document.querySelector('.terminal-panel') as HTMLElement | null;
    if (!menu) return { menuExists: false };
    const r = menu.getBoundingClientRect();
    return {
      menuExists: true,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      panelContain: panel ? getComputedStyle(panel).contain : null,
    };
  });
}

test('the ⋯ menu is portaled out of .terminal-panel so its fixed positioning resolves against the viewport', async () => {
  // The bug: .terminal-panel has `contain: layout style` for terminal-update
  // perf isolation. That makes it a containing block for `position: fixed`
  // descendants - so the menu's right/top coords (computed against
  // window.innerWidth) end up resolved against the panel's box and the menu
  // can land off-screen. Pin the fix by asserting the menu's DOM parent is
  // NOT inside any element with `contain` set.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.click('.terminal-pane-menu-btn');
    await window.waitForTimeout(200);

    const where = await window.evaluate(() => {
      const menu = document.querySelector('.pane-menu') as HTMLElement | null;
      if (!menu) return { exists: false };
      let hasContainedAncestor = false;
      let p: HTMLElement | null = menu.parentElement;
      while (p && p !== document.body) {
        const c = getComputedStyle(p).contain;
        if (c && c !== 'none' && c !== 'normal') {
          hasContainedAncestor = true;
          break;
        }
        p = p.parentElement;
      }
      return {
        exists: true,
        parentTag: menu.parentElement?.tagName,
        parentIsBody: menu.parentElement === document.body,
        hasContainedAncestor,
      };
    });
    console.log('PORTAL-PARENT:', JSON.stringify(where));
    expect(where.exists).toBe(true);
    expect(where.hasContainedAncestor).toBe(false);
  } finally {
    await close();
  }
});

test('clicking the per-pane ⋯ menu opens a visible menu (single pane)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const diag = await clickAndDiag(window);
    console.log('SINGLE-PANE:', JSON.stringify(diag));

    expect(diag.menuExists).toBe(true);
    expect(diag.rect!.width).toBeGreaterThan(40);
    expect(diag.rect!.height).toBeGreaterThan(40);
    expect(diag.rect!.x).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.y).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.right).toBeLessThanOrEqual(diag.viewport!.w);
    expect(diag.rect!.bottom).toBeLessThanOrEqual(diag.viewport!.h);
  } finally {
    await close();
  }
});

test('clicking the ⋯ menu in focus mode (multi-pane) shows a visible menu', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Make 2 panes, then enter focus mode.
    await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const focused = store.focusedTerminalId ?? Array.from(store.terminals.keys())[0];
      return store.splitTerminal(focused, 'horizontal', undefined, 'right');
    });
    await window.waitForTimeout(1200);

    await window.keyboard.press('Control+Shift+f');
    await window.waitForTimeout(500);

    const state = await window.evaluate(() => (window as any).__terminalStore.getState().viewMode);
    expect(state).toBe('focus');

    // Find the focused panel's ⋯ button. With pointer-events:none on hidden
    // leaves, only the focused leaf's button should be reachable.
    await window.click('.terminal-panel.focused .terminal-pane-menu-btn');
    await window.waitForTimeout(250);

    const diag = await window.evaluate(() => {
      const menu = document.querySelector('.pane-menu') as HTMLElement | null;
      if (!menu) return { menuExists: false };
      const r = menu.getBoundingClientRect();
      return {
        menuExists: true,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    });
    console.log('FOCUS-MODE-MENU:', JSON.stringify(diag));

    expect(diag.menuExists).toBe(true);
    expect(diag.rect!.width).toBeGreaterThan(40);
    expect(diag.rect!.height).toBeGreaterThan(40);
    expect(diag.rect!.x).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.y).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.right).toBeLessThanOrEqual(diag.viewport!.w);
    expect(diag.rect!.bottom).toBeLessThanOrEqual(diag.viewport!.h);
  } finally {
    await close();
  }
});

test('clicking the ⋯ menu of a non-leftmost pane in a horizontal split shows a menu inside the viewport', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Spawn a second pane to the right via the store's splitTerminal API.
    await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const focused = store.focusedTerminalId ?? Array.from(store.terminals.keys())[0];
      return store.splitTerminal(focused, 'horizontal', undefined, 'right');
    });
    await window.waitForTimeout(1500);

    // We expect at least 2 panes now.
    const paneCount = await window.evaluate(() => document.querySelectorAll('.terminal-panel').length);
    console.log('panes:', paneCount);
    expect(paneCount).toBeGreaterThanOrEqual(2);

    // Click the second pane's ⋯ button (rightmost button = right pane).
    const buttons = await window.$$('.terminal-pane-menu-btn');
    console.log('menu buttons:', buttons.length);
    // Pick the rightmost button so we exercise the case where the panel's
    // box is in the right half of the viewport.
    const rects = await Promise.all(buttons.map((b) => b.boundingBox()));
    let pickIdx = 0;
    for (let i = 1; i < rects.length; i++) {
      if ((rects[i]?.x ?? 0) > (rects[pickIdx]?.x ?? 0)) pickIdx = i;
    }
    await buttons[pickIdx].hover();
    await window.waitForTimeout(100);
    await buttons[pickIdx].click();
    await window.waitForTimeout(250);

    const diag = await window.evaluate(() => {
      const menu = document.querySelector('.pane-menu') as HTMLElement | null;
      if (!menu) return { menuExists: false };
      const r = menu.getBoundingClientRect();
      return {
        menuExists: true,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    });
    console.log('SPLIT-PANE-RIGHT:', JSON.stringify(diag));

    expect(diag.menuExists).toBe(true);
    expect(diag.rect!.width).toBeGreaterThan(40);
    expect(diag.rect!.height).toBeGreaterThan(40);
    expect(diag.rect!.x).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.y).toBeGreaterThanOrEqual(0);
    expect(diag.rect!.right).toBeLessThanOrEqual(diag.viewport!.w);
    expect(diag.rect!.bottom).toBeLessThanOrEqual(diag.viewport!.h);
  } finally {
    await close();
  }
});
