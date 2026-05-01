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

    // Find ALL rows that returned a link with the full URL text. Post TASK-47
    // each row's link is clipped to that row (startY === endY) so we can no
    // longer assert "endY > startY" — the user-visible contract is "every row
    // the URL spans returns a clickable link with the full URL text", which
    // we verify here.
    const rowsThatDetect: number[] = [];
    for (const y of Object.keys(allRows)) {
      const results = allRows[+y].results || [];
      if (results.some((l: any) => l.text === url)) rowsThatDetect.push(+y);
    }
    console.log('rows detecting full URL:', rowsThatDetect);

    // The bug being regression-tested: pre-fix, only the starting row matched.
    // Post-fix, every wrapped row returns the full URL.
    expect(rowsThatDetect.length).toBeGreaterThanOrEqual(2);
    for (const y of rowsThatDetect) {
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

// TASK-47: pre-fix, every row that the URL touched returned a link with the
// FULL multi-row range. xterm registered each as a separate link record, so a
// single click hit N overlapping records and fired window.open N times. The
// fix clips each row's link range to JUST that row.
test('clicking a wrapped URL fires window.open exactly once per click (TASK-47)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installWindowOpenSpy(window);

    const cols = await getTerminalCols(window);
    expect(cols).toBeGreaterThan(40);

    // URL guaranteed to wrap across 3+ rows so the bug would multiply ×3.
    const urlTail = 'c'.repeat(cols * 2 + 10);
    const url = `https://example.com/` + urlTail;
    await writeToTerminal(window, '\r\n' + url);
    await window.waitForTimeout(400);

    // Probe every row in range to find which rows the URL spans.
    const allRows: Record<number, any> = {};
    for (let y = 1; y <= 10; y++) {
      allRows[y] = await getLinksViaProvider(window, y);
    }

    const urlRows: number[] = [];
    for (const yKey of Object.keys(allRows)) {
      const y = +yKey;
      const results = allRows[y].results || [];
      if (results.some((l: any) => l.text === url)) urlRows.push(y);
    }
    console.log('URL detected on rows:', urlRows);
    expect(urlRows.length).toBeGreaterThanOrEqual(2);

    // Simulate "what happens when xterm dispatches a click at row Y": every
    // link entry whose range contains the click position has its activate()
    // fired. Pre-fix, all rows returned links with the same multi-row range,
    // so a click at any row was contained by N entries → fired N times.
    // Post-fix, each row's link is clipped to that row → click at row Y
    // matches exactly 1 entry.
    const clickRow = urlRows[Math.floor(urlRows.length / 2)];
    const fireCount = await window.evaluate(async ({ clickY, expectedUrl }) => {
      (window as any).__openCalls = [];
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry.terminal;
      const core = (term as any)._core;
      const service = core?._linkProviderService;
      const providers = service.linkProviders || service._linkProviders;

      // Collect every link from every row whose range covers (clickY).
      // This mirrors how xterm decides which links a click intersects: the
      // link layer renders links from per-row provider results and a click at
      // row Y fires every link whose range covers Y.
      const matched: any[] = [];
      for (let y = 1; y <= 10; y++) {
        for (const p of providers) {
          await new Promise<void>((resolve) => {
            try {
              p.provideLinks(y, (links: any) => {
                if (links) {
                  for (const l of links) {
                    if (l.text !== expectedUrl) continue;
                    const sy = l.range?.start?.y;
                    const ey = l.range?.end?.y;
                    if (sy <= clickY && clickY <= ey) matched.push(l);
                  }
                }
                resolve();
              });
            } catch { resolve(); }
          });
        }
      }
      // Fire activate on every matching link entry, just like xterm would.
      for (const l of matched) {
        try { l.activate?.(new MouseEvent('click'), l.text); } catch { /* ignore */ }
      }
      return matched.length;
    }, { clickY: clickRow, expectedUrl: url });

    console.log(`click at row ${clickRow} matched ${fireCount} link entries`);
    const openCalls = await getOpenCalls(window);
    console.log('window.open calls:', openCalls.length);

    // The actual regression assertion: ONE click → ONE window.open.
    expect(openCalls.length).toBe(1);
    expect(openCalls[0].url).toBe(url);
  } finally {
    await close();
  }
});

// TASK-46: gh CLI and similar emit long URLs split across HARD newlines with
// the continuation indented under the URL start. Pre-fix, the link provider
// bailed at the seam check and only the first line was clickable; clicking
// opened a truncated URL.
test('URL split across hard newlines with indented continuation is stitched (TASK-46)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const head = 'https://github.com/enterprises/microsoft/sso?authorization_request=A42LHL5Y3IDODQAD';
    const cont1 = 'CONTINUATIONTOKENPART1XXYYZZ1234567890';
    const cont2 = 'CONTINUATIONTOKENPART2AAABBBCCC';
    const fullUrl = head + cont1 + cont2;
    // Hard newlines + leading whitespace on continuations is the gh-CLI shape.
    await writeToTerminal(window, '\r\n' + head + '\r\n   ' + cont1 + '\r\n   ' + cont2 + '\r\n');
    await window.waitForTimeout(400);

    // Probe rows: find which ones return a link, and assert the link text is
    // the FULL stitched URL (head + cont1 + cont2), not just the head.
    const stitchedRows: number[] = [];
    let firstSeenText = '';
    for (let y = 1; y <= 10; y++) {
      const probe = await getLinksViaProvider(window, y);
      const results = probe.results || [];
      for (const l of results) {
        if (typeof l.text === 'string' && l.text.startsWith('https://github.com/')) {
          stitchedRows.push(y);
          if (!firstSeenText) firstSeenText = l.text;
        }
      }
    }

    console.log('TASK-46 link rows:', stitchedRows, 'first text:', firstSeenText);

    // At minimum: the head row plus both continuation rows should match.
    expect(stitchedRows.length).toBeGreaterThanOrEqual(3);
    // Critical assertion: the link text is the FULL stitched URL.
    expect(firstSeenText).toBe(fullUrl);
  } finally {
    await close();
  }
});

