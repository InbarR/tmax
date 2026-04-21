import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

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

async function countLinkDecorations(window: Page): Promise<number> {
  return window.evaluate(() => {
    return document.querySelectorAll('.xterm-decoration-overview-ruler, .xterm-link-layer > *, .xterm-link, [class*="link"]').length;
  });
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

async function getOpenCalls(window: Page): Promise<Array<{ url: string; target?: string }>> {
  return window.evaluate(() => (window as any).__openCalls.slice());
}

async function getLinksViaProvider(window: Page, row: number): Promise<any> {
  return window.evaluate(async (r: number) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return { error: 'no entry' };
    const term = entry.terminal;
    const core = (term as any)._core;
    const service = core?._linkProviderService;
    if (!service) return { error: 'no service' };
    const serviceKeys = Object.keys(service);
    const providers = service.linkProviders || service._linkProviders;
    if (!providers) return { error: 'no providers', serviceKeys };
    if (providers.length === 0) return { error: 'empty providers', serviceKeys };

    const results: any[] = [];
    for (const p of providers) {
      await new Promise<void>((resolve) => {
        try {
          p.provideLinks(r, (links: any) => {
            if (links) {
              for (const l of links) {
                results.push({
                  text: l.text,
                  startY: l.range?.start?.y,
                  endY: l.range?.end?.y,
                });
              }
            }
            resolve();
          });
        } catch (e: any) {
          results.push({ error: String(e) });
          resolve();
        }
      });
    }
    return { serviceKeys, providerCount: providers.length, results };
  }, row);
}

async function summarizeAllRows(window: Page, maxRow: number): Promise<string> {
  return window.evaluate((max: number) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return '';
    const term = entry.terminal;
    const buf = term.buffer.active;
    const out: string[] = [];
    for (let y = 0; y <= max && y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      out.push(`y=${y} wrapped=${line.isWrapped} text=${JSON.stringify(text.slice(0, 80))}${text.length > 80 ? '...' : ''}`);
    }
    return out.join('\n');
  }, maxRow);
}

test('a URL wrapped across two rows is detected by the link provider on both rows (#62)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installWindowOpenSpy(window);

    const cols = await getTerminalCols(window);
    console.log('terminal cols:', cols);
    expect(cols).toBeGreaterThan(40);

    // Build a URL guaranteed to wrap across 2+ rows.
    const urlTail = 'b'.repeat(cols + 10);
    const url = `https://example.com/` + urlTail;
    // Write URL immediately so it starts at col 1 of row 1, wraps into row 2.
    await writeToTerminal(window, '\r\n' + url);
    await window.waitForTimeout(400);

    // Probe each row and find where the URL is registered
    const allRows: Record<number, any> = {};
    for (let y = 1; y <= 6; y++) {
      allRows[y] = await getLinksViaProvider(window, y);
    }
    console.log('links per row:');
    for (const y of Object.keys(allRows)) {
      const r = allRows[+y];
      console.log(`  row ${y}:`, JSON.stringify(r.results?.map((l: any) => ({
        textLen: l.text?.length,
        startY: l.startY,
        endY: l.endY,
      })) || []));
    }

    // Find rows where the URL (startY) begins
    const startRows = new Set<number>();
    const endRows = new Set<number>();
    for (const y of Object.keys(allRows)) {
      const results = allRows[+y].results || [];
      for (const l of results) {
        if (l.text === url) {
          startRows.add(l.startY);
          endRows.add(l.endY);
        }
      }
    }

    // The bug: link is only detected at the row where it starts, not on
    // the wrapped continuation row. With a proper fix, querying ANY of
    // the rows the URL visually occupies should return the full URL link.
    const startY = [...startRows][0];
    const endY = [...endRows][0];
    console.log('URL visually spans rows', startY, 'to', endY);
    expect(startY).toBeDefined();
    expect(endY).toBeGreaterThan(startY!);

    // Assert the URL is detected when probing the WRAPPED row, not just the start
    for (let y = startY!; y <= endY!; y++) {
      const results = allRows[y]?.results || [];
      const found = results.some((l: any) => l.text === url);
      console.log(`  row ${y} detects full URL: ${found}`);
      expect(found).toBe(true);
    }
  } finally {
    await close();
  }
});

test('URL wrapped across rows with ANSI color codes is detected on both rows (#62)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const cols = await getTerminalCols(window);
    const extra = 'y'.repeat(Math.max(0, cols + 20));
    const url = `https://github.com/InbarR/tmax/pull/99?data=${extra}`;
    // Wrap in blue color SGR codes (what git/gh often emit for URLs)
    const ansiColored = `\x1b[34m${url}\x1b[0m`;
    await writeToTerminal(window, '\r\nurl: ' + ansiColored + '\r\n');
    await window.waitForTimeout(400);

    console.log('buffer content (ANSI URL):\n' + (await summarizeAllRows(window, 10)));

    const allRows: Record<number, any> = {};
    for (let y = 1; y <= 10; y++) {
      allRows[y] = await getLinksViaProvider(window, y);
    }

    // Find any row where the full URL was detected
    const rowsFound: number[] = [];
    for (const y of Object.keys(allRows)) {
      const results = allRows[+y].results || [];
      if (results.some((l: any) => l.text === url || l.text.includes(url.slice(-20)))) {
        rowsFound.push(+y);
      }
    }
    console.log('rows detecting ANSI URL:', rowsFound);
    expect(rowsFound.length).toBeGreaterThan(1); // Must be detected on both wrap rows
  } finally {
    await close();
  }
});

test('realistic GitHub PR URL wrapped across rows is detected on both rows (#62)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const cols = await getTerminalCols(window);
    // Format: gh pr view output shape with a URL that'll naturally wrap.
    // Using a realistic GitHub PR URL with enough query params to wrap.
    // Pad with enough query params to exceed terminal width
    const extra = 'x'.repeat(Math.max(0, cols + 20));
    const url = `https://github.com/InbarR/tmax/pull/99?data=${extra}&sort=desc`;
    expect(url.length).toBeGreaterThan(cols); // must wrap

    // Seed some context lines first (like gh pr view output)
    await writeToTerminal(window, '\r\nurl:  ' + url + '\r\n');
    await window.waitForTimeout(400);

    console.log('buffer content:\n' + (await summarizeAllRows(window, 10)));

    const allRows: Record<number, any> = {};
    for (let y = 1; y <= 10; y++) {
      allRows[y] = await getLinksViaProvider(window, y);
    }

    const rowsDetectingUrl = Object.keys(allRows).filter((y) =>
      (allRows[+y].results || []).some((l: any) => l.text === url),
    );
    console.log('rows detecting the GitHub URL:', rowsDetectingUrl);

    // Find the span
    let startY = Infinity, endY = -Infinity;
    for (const y of Object.keys(allRows)) {
      const results = allRows[+y].results || [];
      for (const l of results) {
        if (l.text === url) {
          if (l.startY < startY) startY = l.startY;
          if (l.endY > endY) endY = l.endY;
        }
      }
    }
    console.log(`GitHub URL spans rows ${startY}..${endY}`);
    expect(Number.isFinite(startY)).toBe(true);
    expect(endY).toBeGreaterThan(startY);

    // Both wrap rows should detect the full URL
    for (let y = startY; y <= endY; y++) {
      const found = (allRows[y]?.results || []).some((l: any) => l.text === url);
      expect(found).toBe(true);
    }
  } finally {
    await close();
  }
});
