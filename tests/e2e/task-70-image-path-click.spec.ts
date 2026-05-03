// TASK-70: Click image paths in the terminal to open them in the OS default
// viewer.
//
// When tmax saves a clipboard image (preload's clipboardSaveImage writes to
// os.tmpdir()/tmax-clipboard-<random>/clipboard-<timestamp>-<random>.png and
// pastes that path), the path text shows up in the terminal. AI agents like
// Claude Code echo it back in their prompt history. Clicking the path should
// open the image in the OS default viewer via shell.openPath.
//
// The fix mirrors the existing .md link provider in TerminalPanel.tsx but
// routes activate() to window.terminalAPI.openPath(absolutePath).
//
// These specs:
//   1. Spy on window.terminalAPI.openPath via a Proxy.
//   2. Write a known image path into the terminal buffer.
//   3. Click that path's row.
//   4. Assert openPath was called with the resolved absolute path.
//   5. Verify URL handling is unaffected - https://example.com/foo.png still
//      opens via window.open, not via openPath.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function installOpenPathSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__openPathCalls = [];
    try {
      const api = (window as any).terminalAPI;
      const orig = api.openPath?.bind(api);
      Object.defineProperty(api, 'openPath', {
        value: async (p: string) => {
          (window as any).__openPathCalls.push(p);
          // Don't actually open the file in the test environment.
          return '';
        },
        configurable: true,
        writable: true,
      });
    } catch {
      const origApi = (window as any).terminalAPI;
      (window as any).terminalAPI = new Proxy(origApi, {
        get(target, p, recv) {
          if (p === 'openPath') {
            return async (path: string) => {
              (window as any).__openPathCalls.push(path);
              return '';
            };
          }
          return Reflect.get(target, p, recv);
        },
      });
    }
  });
}

async function installWindowOpenSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__openCalls = [];
    window.open = (url?: string | URL, target?: string, features?: string) => {
      (window as any).__openCalls.push({ url: String(url || ''), target, features });
      return null;
    };
  });
}

async function getOpenPathCalls(window: Page): Promise<string[]> {
  return window.evaluate(() => ((window as any).__openPathCalls || []).slice());
}

async function getWindowOpenCalls(window: Page): Promise<Array<{ url: string }>> {
  return window.evaluate(() => ((window as any).__openCalls || []).slice());
}

async function setTerminalCwd(window: Page, cwd: string): Promise<void> {
  await window.evaluate((c: string) => {
    const store = (window as any).__terminalStore;
    const id = store.getState().focusedTerminalId;
    const terms = new Map(store.getState().terminals);
    const entry = terms.get(id);
    if (entry) {
      terms.set(id, { ...entry, cwd: c });
      store.setState({ terminals: terms });
    }
  }, cwd);
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

test.describe('TASK-70: click image path opens default viewer', () => {
  test('absolute Windows .png path - click calls openPath with that path', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installOpenPathSpy(window);
      await installWindowOpenSpy(window);

      // Mimic the actual clipboardSaveImage shape from preload.ts.
      const imagePath = 'C:\\Users\\inrotem\\AppData\\Local\\Temp\\tmax-clipboard-WXlprz\\clipboard-2026-05-03T07-23-05-782Z-dlzpbw73.png';
      const marker = 'clipboard-2026-05-03T07-23-05-782Z';
      await writeToTerminal(window, '\r\nhere is the image: ' + imagePath + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, marker);
      expect(row).toBeGreaterThan(0);

      // Click somewhere inside the path - well past 'here is the image: '.
      const pt = await cellCenterPixel(window, row, 'here is the image: '.length + 5);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const openPathCalls = await getOpenPathCalls(window);
      const windowOpenCalls = await getWindowOpenCalls(window);
      console.log('openPath calls:', openPathCalls);
      console.log('window.open calls:', windowOpenCalls);

      expect(openPathCalls.length).toBe(1);
      expect(openPathCalls[0]).toBe(imagePath);
      // URL provider must NOT have fired for this path.
      expect(windowOpenCalls.length).toBe(0);
    } finally {
      await close();
    }
  });

  test('POSIX absolute /tmp .png path - click resolves and calls openPath', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installOpenPathSpy(window);
      await installWindowOpenSpy(window);

      const imagePath = '/tmp/tmax-clipboard-abc/clipboard-1234.png';
      await writeToTerminal(window, '\r\nimg: ' + imagePath + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'clipboard-1234.png');
      expect(row).toBeGreaterThan(0);

      const pt = await cellCenterPixel(window, row, 'img: '.length + 10);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const openPathCalls = await getOpenPathCalls(window);
      expect(openPathCalls.length).toBe(1);
      expect(openPathCalls[0]).toBe(imagePath);
    } finally {
      await close();
    }
  });

  test('relative ./pic.jpg resolves against pane cwd', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installOpenPathSpy(window);
      await installWindowOpenSpy(window);

      const cwd = 'C:\\fake\\cwd';
      await setTerminalCwd(window, cwd);

      const relativePath = './pic.jpg';
      await writeToTerminal(window, '\r\nopen ' + relativePath + ' please\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'pic.jpg');
      expect(row).toBeGreaterThan(0);

      const pt = await cellCenterPixel(window, row, 'open '.length + 3);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const openPathCalls = await getOpenPathCalls(window);
      expect(openPathCalls.length).toBe(1);
      // Expect resolution against cwd with backslash separator.
      expect(openPathCalls[0]).toBe('C:\\fake\\cwd\\./pic.jpg');
    } finally {
      await close();
    }
  });

  test('https://example.com/foo.png URL still opens in browser, not via openPath', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installOpenPathSpy(window);
      await installWindowOpenSpy(window);

      const url = 'https://example.com/foo.png';
      await writeToTerminal(window, '\r\nlink: ' + url + '\r\n');
      await window.waitForTimeout(500);

      const row = await findRowContaining(window, 'example.com/foo.png');
      expect(row).toBeGreaterThan(0);

      const pt = await cellCenterPixel(window, row, 'link: '.length + 8);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const openPathCalls = await getOpenPathCalls(window);
      const windowOpenCalls = await getWindowOpenCalls(window);
      console.log('openPath:', openPathCalls, 'window.open:', windowOpenCalls);

      // window.open fires for the URL.
      expect(windowOpenCalls.length).toBe(1);
      expect(windowOpenCalls[0].url).toBe(url);
      // openPath must NOT have been called for a URL.
      expect(openPathCalls.length).toBe(0);
    } finally {
      await close();
    }
  });

  test('all common image extensions match (png, jpg, jpeg, gif, bmp, webp)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installOpenPathSpy(window);
      await installWindowOpenSpy(window);

      const exts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
      for (const ext of exts) {
        const imgPath = `C:\\imgs\\sample.${ext}`;
        const marker = `sample.${ext}`;

        await window.evaluate(() => { (window as any).__openPathCalls = []; });
        await writeToTerminal(window, '\r\nclick: ' + imgPath + '\r\n');
        await window.waitForTimeout(400);

        const row = await findRowContaining(window, marker);
        expect(row).toBeGreaterThan(0);

        const pt = await cellCenterPixel(window, row, 'click: '.length + 3);
        await window.mouse.move(pt.x, pt.y);
        await window.waitForTimeout(150);
        await window.mouse.click(pt.x, pt.y);
        await window.waitForTimeout(400);

        const calls = await getOpenPathCalls(window);
        console.log(`ext=${ext} openPath calls:`, calls);
        expect(calls.length, `ext .${ext} should fire openPath`).toBe(1);
        expect(calls[0]).toBe(imgPath);
      }
    } finally {
      await close();
    }
  });
});
