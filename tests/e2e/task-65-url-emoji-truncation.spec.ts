// TASK-65: URL clicks containing an embedded emoji open a truncated URL.
//
// User report: clicking
//   https://github.com/gim-home/m/compare/main...inrotem_microsoftⓂ️fix/settings-width-cap?expand=1
// in a tmax pane navigates to
//   https://github.com/gim-home/m/compare/main...inrotem_microsoft%E2%93%82%EF%B8%8F
// (Ⓜ️ = U+24C2 + variation selector U+FE0F, URL-encoded). Everything after
// the emoji is dropped.
//
// Suspected cause: TerminalPanel.tsx URL_BODY (the hard-newline stitch
// seam check at line 378 pre-fix) was strict ASCII only, so when the URL
// wrapped to a second row that xterm marked NOT-soft-wrapped, the seam
// check on the variation selector U+FE0F failed and stitching aborted at
// the emoji. Fix widens URL_BODY to accept Unicode letters / numbers /
// marks / symbols.
//
// Note: this spec deliberately emits a URL that we KNOW will not be
// soft-wrapped by xterm — we use explicit \r\n midway through the URL to
// force the hard-newline path. xterm's wide-char wrap behaviour at exact
// terminal-width boundaries is unstable across resizes; pinning the wrap
// point with literal \r\n is what makes the repro deterministic.
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
    window.open = (url?: string | URL, target?: string, features?: string) => {
      (window as any).__openCalls.push({ url: String(url || ''), target, features });
      return null;
    };
  });
}

async function getOpenCalls(window: Page): Promise<Array<{ url: string }>> {
  return window.evaluate(() => (window as any).__openCalls.slice());
}

async function findRowContaining(window: Page, needle: string): Promise<number> {
  return window.evaluate((s: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const buf = entry.terminal.buffer.active;
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.includes(s)) return y + 1;
    }
    return -1;
  }, needle);
}

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
    const dims = core?._renderService?.dimensions;
    const cellW = dims?.css?.cell?.width || dims?.actualCellWidth || 9;
    const cellH = dims?.css?.cell?.height || dims?.actualCellHeight || 17;
    const screen = (entry.container || document).querySelector('.xterm-screen') as HTMLElement;
    const rect = screen.getBoundingClientRect();
    const buf = term.buffer.active;
    const viewportRow = (y - 1) - buf.viewportY;
    const px = rect.left + (c - 1) * cellW + cellW / 2;
    const py = rect.top + viewportRow * cellH + cellH / 2;
    return { x: Math.round(px), y: Math.round(py) };
  }, { y: bufRow1Based, c: col1Based });
}

test.describe('TASK-65: URL with embedded emoji must not truncate at the emoji', () => {
  test('hard-newline-split URL across an emoji boundary opens the FULL URL', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      // The user's actual URL shape: branch name embeds Ⓜ️ (U+24C2 + U+FE0F).
      // We split on a hard newline RIGHT after the variation selector to
      // force the hard-newline stitch path. Pre-fix this fails because
      // URL_BODY rejects U+FE0F at the seam.
      const head = 'https://github.com/gim-home/m/compare/main...inrotem_microsoftⓂ️';
      const tail = 'fix/settings-width-cap?expand=1';
      const fullUrl = head + tail;
      await writeToTerminal(window, '\r\n' + head + '\r\n   ' + tail + '\r\n');
      await window.waitForTimeout(500);

      const headRow = await findRowContaining(window, 'inrotem_microsoft');
      expect(headRow).toBeGreaterThan(0);

      // Click in the middle of the head row's URL.
      const pt = await cellCenterPixel(window, headRow, 30);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      console.log('open calls:', calls.length, 'urls:', calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(fullUrl);
    } finally {
      await close();
    }
  });

  test('plain (non-emoji) hard-newline-split URL still works (no regression)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      const head = 'https://github.com/enterprises/microsoft/sso?authorization_request=A42LHL';
      const tail = 'ZMKTDEHCGMPU3CONTINUATION';
      const fullUrl = head + tail;
      await writeToTerminal(window, '\r\n' + head + '\r\n   ' + tail + '\r\n');
      await window.waitForTimeout(500);

      const headRow = await findRowContaining(window, 'A42LHL');
      expect(headRow).toBeGreaterThan(0);

      const pt = await cellCenterPixel(window, headRow, 30);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(fullUrl);
    } finally {
      await close();
    }
  });
});
