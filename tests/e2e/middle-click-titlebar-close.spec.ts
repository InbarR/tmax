import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-107: Middle-clicking a terminal pane's title bar closes that pane,
// mirroring the existing tab middle-click-close UX (TabBar.tsx). The
// handler lives on `.terminal-pane-title` in TerminalPanel.tsx so the
// behavior covers both tiled panes and floating panels (which share the
// same title-bar element). Interactive children (rename input, the
// status-dot/X container, and any nested buttons) are excluded so they
// keep their existing click semantics.

async function terminalCount(window: Page): Promise<number> {
  return window.evaluate(() => {
    const store = (window as any).__terminalStore;
    return store.getState().terminals.size as number;
  });
}

async function setPaneTitle(window: Page, terminalId: string, title: string): Promise<void> {
  // Brand-new dev panes initialize their title from the first PTY output,
  // which lags. Force-set a title so .terminal-pane-title renders
  // deterministically. Same trick used by rename-doesnt-close.spec.ts.
  await window.evaluate(({ tid, t }) => {
    const store = (window as any).__terminalStore;
    const s = store.getState();
    const map = new Map(s.terminals);
    const inst = map.get(tid);
    map.set(tid, { ...inst, title: t });
    store.setState({ terminals: map });
  }, { tid: terminalId, t: title });
}

test('middle-click on a tiled pane title bar closes that terminal', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Add a second terminal so closing one doesn't tear down the app.
    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      () => ((window as any).__terminalStore.getState().terminals.size as number) >= 2,
      null,
      { timeout: 5_000 },
    );

    const ids: string[] = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return Array.from(s.terminals.keys()) as string[];
    });
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const targetId = ids[0];

    await setPaneTitle(window, targetId, 'middle-click-close-tiled');
    await window.waitForSelector(`[data-terminal-id="${targetId}"] .terminal-pane-title-text`, { timeout: 3_000 });

    const before = await terminalCount(window);
    await window
      .locator(`[data-terminal-id="${targetId}"] .terminal-pane-title-text`)
      .click({ button: 'middle' });

    await window.waitForFunction(
      (tid) => !((window as any).__terminalStore.getState().terminals.has(tid)),
      targetId,
      { timeout: 3_000 },
    );
    expect(await terminalCount(window)).toBe(before - 1);
  } finally {
    await close();
  }
});

test('middle-click on a floating panel title bar closes that terminal', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Need 2 terminals so closing the floating one leaves the app alive.
    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      () => ((window as any).__terminalStore.getState().terminals.size as number) >= 2,
      null,
      { timeout: 5_000 },
    );

    const focusedId: string = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });

    // Float the focused pane via the same shortcut covered by float-shortcut.spec.ts.
    await window.keyboard.press('Control+Shift+u');
    await window.waitForFunction(
      (tid) => {
        const s = (window as any).__terminalStore.getState();
        return s.terminals.get(tid)?.mode === 'floating';
      },
      focusedId,
      { timeout: 3_000 },
    );

    await setPaneTitle(window, focusedId, 'middle-click-close-floating');
    await window.waitForSelector(`[data-terminal-id="${focusedId}"] .terminal-pane-title.float-titlebar`, { timeout: 3_000 });

    await window
      .locator(`[data-terminal-id="${focusedId}"] .terminal-pane-title-text`)
      .click({ button: 'middle' });

    await window.waitForFunction(
      (tid) => {
        const s = (window as any).__terminalStore.getState();
        const goneFromTerminals = !s.terminals.has(tid);
        const goneFromFloating = !s.layout.floatingPanels.some((p: any) => p.terminalId === tid);
        return goneFromTerminals && goneFromFloating;
      },
      focusedId,
      { timeout: 3_000 },
    );
  } finally {
    await close();
  }
});

test('middle-click on the status-dot/X container does NOT close the pane', async () => {
  // The status-dot container hosts the pane's existing X close affordance,
  // which is bound to onClick (left-click only). Our new handler must
  // exclude this region so middle-click here is a true no-op rather than
  // an accidental second close path.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      () => ((window as any).__terminalStore.getState().terminals.size as number) >= 2,
      null,
      { timeout: 5_000 },
    );

    const targetId: string = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });
    await setPaneTitle(window, targetId, 'middle-click-status-dot');
    await window.waitForSelector(`[data-terminal-id="${targetId}"] .status-dot-container`, { timeout: 3_000 });

    const before = await terminalCount(window);
    await window
      .locator(`[data-terminal-id="${targetId}"] .status-dot-container`)
      .click({ button: 'middle' });
    await window.waitForTimeout(300);

    const stillExists = await window.evaluate(
      (tid) => (window as any).__terminalStore.getState().terminals.has(tid),
      targetId,
    );
    expect(stillExists).toBe(true);
    expect(await terminalCount(window)).toBe(before);
  } finally {
    await close();
  }
});

test('middle-click on the rename input does NOT close the pane while renaming', async () => {
  // While a pane is being renamed, the title text is replaced by an
  // <input>. The handler must skip the close path when the click target
  // is inside an input so users editing a name don't lose their pane.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.keyboard.press('Control+t');
    await window.waitForFunction(
      () => ((window as any).__terminalStore.getState().terminals.size as number) >= 2,
      null,
      { timeout: 5_000 },
    );

    const targetId: string = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });
    await setPaneTitle(window, targetId, 'middle-click-rename');
    await window.waitForSelector(`[data-terminal-id="${targetId}"] .terminal-pane-title-text`, { timeout: 3_000 });

    await window.dblclick(`[data-terminal-id="${targetId}"] .terminal-pane-title-text`);
    await window.waitForSelector(`[data-terminal-id="${targetId}"] .pane-rename-input`, { timeout: 3_000 });

    const before = await terminalCount(window);
    await window
      .locator(`[data-terminal-id="${targetId}"] .pane-rename-input`)
      .click({ button: 'middle' });
    await window.waitForTimeout(300);

    const stillExists = await window.evaluate(
      (tid) => (window as any).__terminalStore.getState().terminals.has(tid),
      targetId,
    );
    expect(stillExists).toBe(true);
    expect(await terminalCount(window)).toBe(before);
  } finally {
    await close();
  }
});
