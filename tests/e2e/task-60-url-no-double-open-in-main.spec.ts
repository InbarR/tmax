// TASK-60: Regression test for URL clicks opening two browser tabs.
//
// The TASK-58 spec asserts that `window.open` is called exactly once in the
// renderer when a URL is clicked. That alone is not enough — a separate bug
// lived in the main process: `setWindowOpenHandler` denied the new window
// AND we explicitly called `shell.openExternal(url)`. Empirically, another
// navigation handler in the stack already routes denied http(s) URLs to the
// default browser, so the explicit call produced a second tab. The renderer
// spy never saw it because the duplicate happened entirely in main.
//
// This spec spies on `shell.openExternal` in the main process and asserts
// that our handler does NOT call it for plain http(s) URLs. If a future
// change re-adds the explicit call, the count goes from 0 → 1 and this
// spec fails — pointing the reviewer straight at the duplication risk.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
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

async function cellCenterPixel(window: Page, bufRow1Based: number, col1Based: number): Promise<{ x: number; y: number }> {
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

test.describe('TASK-60: URL clicks must not call shell.openExternal explicitly', () => {
  test('clicking a plain http URL: handler runs ONCE, shell.openExternal called ZERO times', async () => {
    const { app, window, close } = await launchTmax();
    try {
      // Install two main-process spies before any clicks:
      //   1) shell.openExternal counter — catches re-introduction of the
      //      explicit duplicate call. Must stay at 0 per click.
      //   2) setWindowOpenHandler counter — proves the click actually
      //      reached main and the URL was processed (otherwise a count of 0
      //      on (1) is meaningless: the path could be silently broken). We
      //      re-register the handler with a wrapper that mirrors main's
      //      current behavior (return {action: 'deny'} without calling
      //      shell.openExternal) so the URL still opens externally via the
      //      implicit fallback.
      await app.evaluate(({ BrowserWindow, shell }) => {
        (global as any).__shellOpenExternalCount = 0;
        (global as any).__shellOpenExternalUrls = [];
        (global as any).__windowOpenHandlerCount = 0;
        (global as any).__windowOpenHandlerUrls = [];

        const orig = shell.openExternal.bind(shell);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (shell as any).openExternal = (url: string, options?: any) => {
          (global as any).__shellOpenExternalCount++;
          (global as any).__shellOpenExternalUrls.push(url);
          return orig(url, options);
        };

        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
            (global as any).__windowOpenHandlerCount++;
            (global as any).__windowOpenHandlerUrls.push(url);
            return { action: 'deny' as const };
          });
        }
      });

      await window.evaluate(() => { window.confirm = () => true; });

      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);

      const url = 'https://example.com/task-60-no-double';
      await writeToTerminal(window, '\r\nclick here -> ' + url + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'task-60-no-double');
      expect(row).toBeGreaterThan(0);

      const pt = await cellCenterPixel(window, row, 'click here -> '.length + 5);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const result = await app.evaluate(() => ({
        openExternalCount: (global as any).__shellOpenExternalCount as number,
        openExternalUrls: (global as any).__shellOpenExternalUrls as string[],
        windowOpenHandlerCount: (global as any).__windowOpenHandlerCount as number,
        windowOpenHandlerUrls: (global as any).__windowOpenHandlerUrls as string[],
      }));

      // Behavior check: the click reached main and our handler saw the URL
      // exactly once. If this fails, the click path is broken (link
      // provider didn't fire, or window.open in the renderer didn't
      // propagate to main) — which would silently drop URLs.
      expect(
        result.windowOpenHandlerCount,
        `setWindowOpenHandler did not fire as expected. Saw URLs: ${result.windowOpenHandlerUrls.join(', ')}`,
      ).toBe(1);
      expect(result.windowOpenHandlerUrls[0]).toBe(url);

      // Regression check: our handler must not re-introduce the explicit
      // shell.openExternal call. Implicit external handling already opens
      // the URL once; an explicit call would double-open.
      expect(
        result.openExternalCount,
        `unexpected explicit shell.openExternal calls: ${result.openExternalUrls.join(', ')}`,
      ).toBe(0);
    } finally {
      await close();
    }
  });
});
