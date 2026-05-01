// TASK-58: Real DOM click reproductions for the two reported URL bugs.
// Existing TASK-47 tests synthesize `activate()` calls directly; the user-
// reported bug reproduces only via a real DOM click through xterm's link
// layer. These specs reproduce the bug end-to-end before any fix.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function installWindowOpenSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__openCalls = [];
    const orig = window.open;
    (window as any).__origOpen = orig;
    window.open = (url?: string | URL, target?: string, features?: string) => {
      (window as any).__openCalls.push({ url: String(url || ''), target, features });
      return null;
    };
  });
}

async function getOpenCalls(window: Page): Promise<Array<{ url: string }>> {
  return window.evaluate(() => (window as any).__openCalls.slice());
}

async function clearOpenCalls(window: Page): Promise<void> {
  await window.evaluate(() => { (window as any).__openCalls = []; });
}

// Locate the screen pixel center of a buffer cell (col is 1-based, row is
// 1-based viewport row from xterm.buffer.active.cursorY-style coords).
async function cellCenterPixel(
  window: Page,
  bufRow1Based: number,
  col1Based: number,
): Promise<{ x: number; y: number }> {
  return window.evaluate(({ y, c }) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry.terminal;
    const core = (term as any)._core;
    // Cell dimensions from the xterm renderer.
    const dims = core?._renderService?.dimensions;
    const cellW = dims?.css?.cell?.width || dims?.actualCellWidth || 9;
    const cellH = dims?.css?.cell?.height || dims?.actualCellHeight || 17;
    // Find the xterm screen element relative to viewport.
    const screen = (entry.container || document).querySelector('.xterm-screen') as HTMLElement;
    const rect = screen.getBoundingClientRect();
    // Convert buffer row to viewport row (subtract scrollback offset).
    const buf = term.buffer.active;
    const viewportRow = (y - 1) - buf.viewportY; // 0-based viewport row
    const px = rect.left + (c - 1) * cellW + cellW / 2;
    const py = rect.top + viewportRow * cellH + cellH / 2;
    return { x: Math.round(px), y: Math.round(py) };
  }, { y: bufRow1Based, c: col1Based });
}

// Find the buffer row that contains a substring; returns 1-based row, or -1.
async function findRowContaining(window: Page, needle: string): Promise<number> {
  return window.evaluate((s: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const buf = entry.terminal.buffer.active;
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.includes(s)) return y + 1; // 1-based
    }
    return -1;
  }, needle);
}

async function getCols(window: Page): Promise<number> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    return (window as any).__getTerminalEntry(id)?.terminal.cols || 0;
  });
}

test.describe('TASK-58: real DOM click on URL link', () => {
  test('OSC 8 hyperlink (gh CLI shape) fires window.open exactly ONCE', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      // Auto-confirm any confirm() dialog xterm's defaultActivate may pop.
      await window.evaluate(() => { window.confirm = () => true; });

      // OSC 8 hyperlink as gh CLI emits for SSO URLs: ESC ]8;;URI BEL TEXT ESC ]8;; BEL
      const url = 'https://github.com/enterprises/microsoft/sso?authorization_request=A42LHLZMKTDEHCGMPU3';
      const osc8 = '\x1b]8;;' + url + '\x07' + url + '\x1b]8;;\x07';
      await writeToTerminal(window, '\r\nopen this -> ' + osc8 + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'A42LHLZMKTDEHCGMPU3');
      expect(row).toBeGreaterThan(0);
      const pt = await cellCenterPixel(window, row, 'open this -> '.length + 10);
      console.log('clicking OSC 8 hyperlink at', pt, 'row', row);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      console.log('open calls after OSC 8 click:', calls.length, calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('clicking a WRAPPED URL fires window.open exactly ONCE', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      const cols = await getCols(window);
      // URL guaranteed to wrap across ≥ 2 rows.
      const tail = 'q'.repeat(cols + 30);
      const url = 'https://example.com/wrapped-' + tail;
      await writeToTerminal(window, '\r\n' + url + '\r\n');
      await window.waitForTimeout(500);

      // Click in the middle of the URL (could be on second row).
      const startRow = await findRowContaining(window, 'wrapped-');
      expect(startRow).toBeGreaterThan(0);
      // Click on row startRow+1 (the wrapped continuation row), col 10.
      const pt = await cellCenterPixel(window, startRow + 1, 10);
      console.log('clicking wrapped URL at', pt, 'row', startRow + 1);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      console.log('open calls after wrapped click:', calls.length, calls.map(c => c.url.length));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('clicking a HARD-NEWLINE-stitched URL (gh CLI shape) fires ONCE with full URL', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      // Mimic the SSO URL the user reported, split across hard newlines.
      const head = 'https://github.com/enterprises/microsoft/sso?authorization_request=A42LHLZ';
      const cont1 = 'MKTDEHCGMPU3CONTINUATIONPART1';
      const cont2 = 'CONTINUATIONPART2EXTRADATA';
      const fullUrl = head + cont1 + cont2;
      await writeToTerminal(window, '\r\n' + head + '\r\n   ' + cont1 + '\r\n   ' + cont2 + '\r\n');
      await window.waitForTimeout(500);

      const headRow = await findRowContaining(window, 'A42LHLZ');
      expect(headRow).toBeGreaterThan(0);

      // Click in middle of head row's URL.
      const pt = await cellCenterPixel(window, headRow, 30);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      console.log('open calls after hard-newline-stitched click:', calls.length);
      console.log('  urls:', calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(fullUrl);
    } finally {
      await close();
    }
  });

  test('clicking a single-line URL fires window.open exactly ONCE', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      const url = 'https://example.com/single-line-url';
      await writeToTerminal(window, '\r\nclick here -> ' + url + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'single-line-url');
      expect(row).toBeGreaterThan(0);

      // Hover first to make xterm build the link decoration.
      const startCol = 'click here -> '.length + 5; // somewhere in the URL
      const pt = await cellCenterPixel(window, row, startCol);
      console.log('clicking at', pt, 'row', row);

      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      // xterm requires a modified click? Check: by default xterm calls activate
      // on plain click for link providers.
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      console.log('open calls after single click:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('clicking URL B opens URL B, not URL A (no URL hijacking)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      const urlA = 'https://github.com/enterprises/microsoft/sso?authorization_request=A42LHLZMKTDEHCGMPU3';
      const urlB = 'https://example.com/second-different-url';
      await writeToTerminal(window, '\r\nfirst:  ' + urlA + '\r\n');
      await writeToTerminal(window, 'second: ' + urlB + '\r\n');
      await window.waitForTimeout(500);

      const rowA = await findRowContaining(window, 'A42LHLZMKTDEHCGMPU3');
      const rowB = await findRowContaining(window, 'second-different-url');
      expect(rowA).toBeGreaterThan(0);
      expect(rowB).toBeGreaterThan(0);

      // Click URL B first, then URL A — verifying neither click is hijacked.
      const ptB = await cellCenterPixel(window, rowB, 'second: '.length + 10);
      await window.mouse.move(ptB.x, ptB.y);
      await window.waitForTimeout(150);
      await window.mouse.click(ptB.x, ptB.y);
      await window.waitForTimeout(400);
      let calls = await getOpenCalls(window);
      console.log('after click B:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(urlB);

      await clearOpenCalls(window);

      const ptA = await cellCenterPixel(window, rowA, 'first:  '.length + 10);
      await window.mouse.move(ptA.x, ptA.y);
      await window.waitForTimeout(150);
      await window.mouse.click(ptA.x, ptA.y);
      await window.waitForTimeout(400);
      calls = await getOpenCalls(window);
      console.log('after click A:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(urlA);
    } finally {
      await close();
    }
  });
});
