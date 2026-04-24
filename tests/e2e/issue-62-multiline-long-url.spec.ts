import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

/**
 * Repro for #62. A very long URL (Outlook safelinks wrapper) pasted into a
 * terminal wraps across 5-6 rows, but xterm's built-in WebLinksAddon only
 * highlighted the first row - so clicking opened a truncated URL. The custom
 * link provider should emit a link entry covering every row the URL occupies.
 */

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function getTerminalCols(window: Page): Promise<number> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    return (window as any).__getTerminalEntry(id)?.terminal.cols || 0;
  });
}

async function getLinksViaProvider(window: Page, row: number): Promise<any> {
  return window.evaluate(async (r: number) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return { error: 'no entry' };
    const term = entry.terminal;
    const core = (term as any)._core;
    const service = core?._linkProviderService;
    const providers = service?.linkProviders || service?._linkProviders || [];
    const results: any[] = [];
    for (const p of providers) {
      await new Promise<void>((resolve) => {
        try {
          p.provideLinks(r, (links: any) => {
            if (links) {
              for (const l of links) {
                results.push({ text: l.text, startY: l.range?.start?.y, endY: l.range?.end?.y });
              }
            }
            resolve();
          });
        } catch { resolve(); }
      });
    }
    return { results };
  }, row);
}

test('6-row-spanning URL is clickable across every wrapped row (#62 repro)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const cols = await getTerminalCols(window);
    expect(cols).toBeGreaterThan(40);

    // Build a URL that will wrap across at least 5 rows. Use a realistic
    // Outlook safelinks shape: safelinks host + long query string.
    const filler = 'a'.repeat(cols * 5);
    const url = `https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2F${filler}&data=x&reserved=0`;

    await writeToTerminal(window, '\r\nlink: ' + url + '\r\n');
    await window.waitForTimeout(400);

    // Probe every visible row, collect all link ranges that match the full URL.
    const rowsWithFullLink: number[] = [];
    const spans: Array<{ startY: number; endY: number }> = [];
    for (let y = 1; y <= 15; y++) {
      const r = await getLinksViaProvider(window, y);
      const full = (r.results || []).filter((l: any) => l.text === url);
      if (full.length > 0) {
        rowsWithFullLink.push(y);
        spans.push({ startY: full[0].startY, endY: full[0].endY });
      }
    }

    console.log('rows that register the full URL:', rowsWithFullLink);
    console.log('reported link span:', spans[0]);

    // The URL is ~6 rows of content; every row it occupies should carry a link.
    expect(rowsWithFullLink.length).toBeGreaterThanOrEqual(5);

    // All reported spans should agree (same start/end for this one URL)
    for (const s of spans) {
      expect(s.startY).toBe(spans[0].startY);
      expect(s.endY).toBe(spans[0].endY);
    }
    expect(spans[0].endY - spans[0].startY).toBeGreaterThanOrEqual(4);
  } finally {
    await close();
  }
});
