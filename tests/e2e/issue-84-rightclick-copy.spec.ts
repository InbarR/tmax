import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function getClipboard(window: Page): Promise<string> {
  return window.evaluate(() => (window as any).terminalAPI.clipboardRead());
}

async function setClipboard(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => (window as any).terminalAPI.clipboardWrite(t), text);
}

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function selectInTerminal(window: Page, col: number, row: number, length: number): Promise<boolean> {
  return window.evaluate(({ col, row, length }) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return false;
    entry.terminal.select(col, row, length);
    return entry.terminal.hasSelection();
  }, { col, row, length });
}

test('issue #84: right-click on terminal with API selection copies to clipboard', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    // Write known text into the terminal via the xterm API directly
    await writeToTerminal(window, '\r\nRIGHT_CLICK_84_XXXX\r\n');
    await window.waitForTimeout(300);

    // Focus terminal
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    // Select the known text (19 chars at col 0 of row 1)
    const hasSelection = await selectInTerminal(window, 0, 1, 19);
    expect(hasSelection).toBe(true);

    // Clear clipboard so we can detect the copy
    await setClipboard(window, '__BEFORE__');
    await window.waitForTimeout(100);

    // Right-click on the terminal screen
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(500);

    const clip = await getClipboard(window);
    console.log('clipboard after right-click:', JSON.stringify(clip));

    expect(clip, `clipboard should contain RIGHT_CLICK_84 but was: ${clip}`).toContain('RIGHT_CLICK_84');
  } finally {
    await close();
  }
});

test('issue #84: right-click after mouse-drag selection copies to clipboard', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    // Write known text and place it at a deterministic row
    await writeToTerminal(window, '\r\nRIGHT_CLICK_84_DRAG\r\n');
    await window.waitForTimeout(300);

    // Focus terminal first
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    // Compute pixel coordinates of the text and drag-select it.
    const coords = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry?.terminal;
      const cell: any = (term as any)._core?._renderService?.dimensions?.css?.cell
        ?? (term as any)._core?._renderService?.dimensions?.actualCellWidth
          ? { width: (term as any)._core._renderService.dimensions.actualCellWidth, height: (term as any)._core._renderService.dimensions.actualCellHeight }
          : null;
      const screen = document.querySelector('.terminal-panel .xterm-screen') as HTMLElement;
      const rect = screen.getBoundingClientRect();
      const cw = cell?.width ?? 9;
      const ch = cell?.height ?? 18;
      // Row 1 (the "RIGHT_CLICK_84_DRAG" line we wrote after \r\n).
      // Start a touch left of column 0 so the first character lands inside the selection.
      const startX = rect.left + 1;
      const endX = rect.left + cw * 19 + cw * 0.6;
      const y = rect.top + ch * 1.5;
      return { startX, endX, y };
    });

    await setClipboard(window, '__BEFORE__');
    await window.waitForTimeout(100);

    await window.mouse.move(coords.startX, coords.y);
    await window.mouse.down();
    await window.mouse.move(coords.endX, coords.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(300);

    const sel = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      return { has: !!entry?.terminal.hasSelection(), text: entry?.terminal.getSelection() ?? '' };
    });
    console.log('after drag - has:', sel.has, 'text:', JSON.stringify(sel.text));
    expect(sel.has).toBe(true);

    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(500);

    const clip = await getClipboard(window);
    console.log('clipboard after right-click:', JSON.stringify(clip));
    expect(clip, `clipboard should contain RIGHT_CLICK_84 but was: ${clip}`).toContain('RIGHT_CLICK_84');
  } finally {
    await close();
  }
});
