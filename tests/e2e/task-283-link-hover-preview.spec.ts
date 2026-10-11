import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

test('hovering a terminal URL previews the exact destination and dismisses it', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => {
      const store = (window as any).__terminalStore;
      const id = store?.getState().focusedTerminalId;
      return !!id && !!(window as any).__getTerminalEntry(id)?.terminal?.element;
    }, null, { timeout: 15_000 });
    const url = 'https://example.com/a/very/long/path?with=query&and=more';

    await window.evaluate((text) => new Promise<void>((resolve) => {
      const store = (window as any).__terminalStore;
      const id = store.getState().focusedTerminalId;
      (window as any).__getTerminalEntry(id)?.terminal.write(`\r\n${text}\r\n`, resolve);
    }), url);

    const linkPoint = await window.evaluate(() => {
      const store = (window as any).__terminalStore;
      const id = store.getState().focusedTerminalId;
      const term = (window as any).__getTerminalEntry(id)?.terminal;
      const screen = term?.element?.querySelector('.xterm-screen') as HTMLElement | null;
      const dimensions = term?._core?._renderService?.dimensions;
      const cellWidth = dimensions?.css?.cell?.width ?? dimensions?.actualCellWidth;
      const cellHeight = dimensions?.css?.cell?.height ?? dimensions?.actualCellHeight;
      if (!screen || !cellWidth || !cellHeight) return null;

      let urlRow = -1;
      for (let index = 0; index < term.buffer.active.length; index++) {
        if (term.buffer.active.getLine(index)?.translateToString(true).includes('https://example.com/')) {
          urlRow = index;
          break;
        }
      }
      if (urlRow < 0) return null;

      const rect = screen.getBoundingClientRect();
      const viewportRow = urlRow - term.buffer.active.viewportY;
      return {
        x: rect.left + cellWidth * 2,
        y: rect.top + cellHeight * (viewportRow + 0.5),
      };
    });

    expect(linkPoint).not.toBeNull();
    await window.mouse.move(linkPoint!.x, linkPoint!.y);
    const preview = window.locator('.terminal-link-preview');
    await expect(preview).toHaveText(url, { timeout: 2_000 });
    await expect(preview).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
  } finally {
    try {
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0));
    } catch {
      // The app may already have exited after the assertion.
    }
    await close();
  }
});
