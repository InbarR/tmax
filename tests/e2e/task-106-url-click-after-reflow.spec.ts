// TASK-106: URL written on a single wide line, then a resize wraps it across
// rows. Clicking the wrapped URL must still fire activate(). The previously
// existing "wrapped URL" coverage (task-58) writes the URL when the terminal
// is already narrow, so xterm never reflows an existing buffer line - the
// reflow path is what triggers the bug here.
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

async function getCols(window: Page): Promise<number> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    return (window as any).__getTerminalEntry(id)?.terminal.cols || 0;
  });
}

async function getRows(window: Page): Promise<number> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    return (window as any).__getTerminalEntry(id)?.terminal.rows || 0;
  });
}

async function resizeTerminal(window: Page, cols: number, rows: number): Promise<void> {
  await window.evaluate(({ c, r }) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry.terminal.resize(c, r);
  }, { c: cols, r: rows });
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

interface BufferDump {
  cols: number;
  rows: number;
  bufferLength: number;
  lines: Array<{ idx: number; isWrapped: boolean; text: string }>;
}

async function dumpBuffer(window: Page, fromRow: number, toRow: number): Promise<BufferDump> {
  return window.evaluate(({ from, to }) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry.terminal;
    const buf = term.buffer.active;
    const lines = [];
    for (let y = from; y <= to && y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      lines.push({
        idx: y,
        isWrapped: !!line.isWrapped,
        text: line.translateToString(true),
      });
    }
    return {
      cols: term.cols,
      rows: term.rows,
      bufferLength: buf.length,
      lines,
    };
  }, { from: fromRow, to: toRow });
}

test.describe('TASK-106: URL click after pane reflow wraps the URL', () => {
  test('TASK-110 TRUNCATE-REPRO: hard-newline URL with bullet+indent continuation, click on head row opens FULL URL', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);

      const url = 'https://vigilant-adventure-v9qpqwn.pages.github.io/playground/#plugins';
      // Mimic the user's screenshot: bullet on row 1, URL split mid-host
      // right after a `.`, continuation indented 2 spaces under the bullet.
      // Hard newlines with explicit indent (not soft-wrap), same shape Ink
      // emits in Claude Code panes.
      const row1 = '\x1b[2m●\x1b[0m https://vigilant-adventure-v9qpqwn.pages.';
      const row2 = '  github.io/playground/#plugins';
      await writeToTerminal(window, '\r\n' + row1 + '\r\n' + row2 + '\r\n');
      await window.waitForTimeout(400);

      const headRow = await findRowContaining(window, 'vigilant-adventure');
      expect(headRow).toBeGreaterThan(0);
      const contRow = await findRowContaining(window, 'github.io/playground');
      expect(contRow).toBeGreaterThan(0);

      const dump = await dumpBuffer(window, headRow - 1, contRow);
      console.log('truncate-repro buffer:', JSON.stringify(dump, null, 2));

      // Probe: ask the link provider directly what links it returns for
      // the head row. This tells us whether truncation happens at the
      // provider level (m[0] is the truncated URL) or at the click level
      // (provider returns full URL but click-to-link hit-test fails).
      const linksForHead = await window.evaluate((rowOneBased: number) => {
        const id = (window as any).__terminalStore.getState().focusedTerminalId;
        const entry = (window as any).__getTerminalEntry(id);
        const term = entry.terminal;
        const core = (term as any)._core;
        const svc = core?._linkProviderService;
        const arr = svc?.linkProviders || svc?._linkProviders || [];
        const out: Array<{ idx: number; text: string; range: any }> = [];
        const promises: Promise<void>[] = [];
        for (let i = 0; i < arr.length; i++) {
          const provider = arr[i];
          if (typeof provider?.provideLinks !== 'function') continue;
          promises.push(new Promise<void>((resolve) => {
            try {
              provider.provideLinks(rowOneBased, (links: any) => {
                if (Array.isArray(links)) {
                  for (const l of links) {
                    out.push({ idx: i, text: l.text, range: l.range });
                  }
                }
                resolve();
              });
            } catch { resolve(); }
          }));
        }
        return Promise.all(promises).then(() => out);
      }, headRow);
      console.log('truncate-repro provider links for head row:', JSON.stringify(linksForHead, null, 2));

      // Hover first so xterm has a chance to build the decoration; some
      // builds gate click dispatch on having seen an active hover link.
      const pt = await cellCenterPixel(window, headRow, 25);
      console.log('truncate-repro hover+click head row at', pt, 'row=', headRow);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(300);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log('truncate-repro after click: open=', calls.length, 'activates=', activates, 'urls=', calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(
        calls[0].url,
        `expected full URL, got truncated: ${calls[0].url}`,
      ).toBe(url);
    } finally {
      await close();
    }
  });

  test('MOUSE-TRACKING: URL click is swallowed when SGR mouse tracking is enabled', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      const url = 'https://github.com/agency-microsoft/playground/compare/users/inrotem/add-video-dub?expand=1';

      // Enable SGR mouse tracking (what Claude Code/Ink does for its mouse UI).
      // ?1000h = X11 mouse tracking, ?1006h = SGR encoding.
      await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h');
      await window.waitForTimeout(150);

      const osc8 = '\x1b]8;;' + url + '\x07' + url + '\x1b]8;;\x07';
      await writeToTerminal(window, '\r\n● ' + osc8 + '\r\n');
      await window.waitForTimeout(300);

      const row = await findRowContaining(window, 'add-video-dub');
      console.log('mouse-tracking row=', row);
      expect(row).toBeGreaterThan(0);

      // Plain click - should be swallowed by mouse tracking, NOT fire link activate.
      const pt = await cellCenterPixel(window, row, 10);
      console.log('mouse-tracking plain click at', pt, 'row=', row);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(400);

      const callsAfterPlain = await getOpenCalls(window);
      const activatesAfterPlain = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log(
        'after PLAIN click w/ mouse tracking: open=', callsAfterPlain.length,
        'urls=', callsAfterPlain.map(c => c.url),
        'activates=', activatesAfterPlain,
      );

      // This is the bug - if it asserts as the ACTUAL behavior the user sees,
      // we have a confirmed repro of "click does nothing in CC."
      if (callsAfterPlain.length === 0) {
        console.log('REPRO CONFIRMED: plain click on URL with mouse tracking on does NOT fire activate');
      } else {
        console.log('plain click DID fire activate even with mouse tracking - hypothesis wrong');
      }

      // Try Shift+Click - xterm convention is that Shift bypasses mouse tracking.
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.keyboard.down('Shift');
      await window.mouse.click(pt.x, pt.y);
      await window.keyboard.up('Shift');
      await window.waitForTimeout(400);

      const callsAfterShift = await getOpenCalls(window);
      const activatesAfterShift = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log(
        'after SHIFT+click w/ mouse tracking: open=', callsAfterShift.length,
        'urls=', callsAfterShift.map(c => c.url),
        'activates=', activatesAfterShift,
      );
    } finally {
      await close();
    }
  });

  test('CC-SHAPE: URL emitted as OSC 8 hyperlink with same text (Claude Code shape) - single-line click', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      // Claude Code (Ink) emits URLs as OSC 8 hyperlinks: ESC]8;;URI BEL TEXT ESC]8;; BEL
      // where TEXT typically equals URI. Surrounded by ANSI color codes.
      const url = 'https://github.com/agency-microsoft/playground/compare/users/inrotem/add-video-dub?expand=1';
      const osc8 = '\x1b]8;;' + url + '\x07' + '\x1b[36m' + url + '\x1b[0m' + '\x1b]8;;\x07';
      // Mimic CC's bullet prefix pattern.
      await writeToTerminal(window, '\r\n\x1b[2m●\x1b[0m ' + osc8 + '\r\n');
      await window.waitForTimeout(400);

      const row = await findRowContaining(window, 'add-video-dub');
      console.log('CC-shape row=', row);
      expect(row).toBeGreaterThan(0);

      // Diagnostic: dump the row that contains the URL.
      const dump = await dumpBuffer(window, row - 1, row + 1);
      console.log('CC-shape buffer:', JSON.stringify(dump, null, 2));

      // What link providers are registered?
      const providerInfo = await window.evaluate(() => {
        const id = (window as any).__terminalStore.getState().focusedTerminalId;
        const entry = (window as any).__getTerminalEntry(id);
        const term = entry.terminal;
        const core = (term as any)._core;
        const svc = core?._linkProviderService;
        const arr = svc?.linkProviders || svc?._linkProviders || [];
        return {
          providerCount: Array.isArray(arr) ? arr.length : -1,
          providerNames: Array.isArray(arr) ? arr.map((p: any) => p?.constructor?.name ?? typeof p) : [],
        };
      });
      console.log('CC-shape link providers:', providerInfo);

      // Click on the URL.
      const pt = await cellCenterPixel(window, row, 10); // somewhere inside URL
      console.log('CC-shape clicking at', pt, 'row=', row);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log('CC-shape after click: open=', calls.length, 'urls=', calls.map(c => c.url), 'activates=', activates);
      expect(calls.length, 'OSC 8 URL click should fire window.open').toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('ALT-SCREEN: URL written in alt-screen TUI, reflow narrow, click wrapped tail', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      const wideCols = await getCols(window);
      const rows = await getRows(window);

      // Enter alt-screen (DECSET 1049) - this is what Copilot CLI / vim / less /
      // any TUI uses. xterm switches to a separate buffer.
      await writeToTerminal(window, '\x1b[?1049h');
      await window.waitForTimeout(200);

      const url = 'https://microsoft.visualstudio.com/OS/_workitems/edit/60129404';
      const line = '| Apr 20 | #60129404 ( ' + url + ')';
      expect(line.length).toBeLessThan(wideCols);

      // Position cursor and write the line in alt-screen.
      await writeToTerminal(window, '\x1b[2;1H' + line + '\r\n');
      await window.waitForTimeout(300);

      // Sanity click on the wide URL.
      const wideRow = await findRowContaining(window, '#60129404');
      console.log('alt-screen wideRow=', wideRow);
      expect(wideRow).toBeGreaterThan(0);
      const widePt = await cellCenterPixel(window, wideRow, line.indexOf('https://') + 5);
      await window.mouse.move(widePt.x, widePt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(widePt.x, widePt.y);
      await window.waitForTimeout(400);
      let calls = await getOpenCalls(window);
      console.log('alt-screen wide click: open=', calls.length, 'urls=', calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);

      await clearOpenCalls(window);

      // Force reflow to wrap the URL.
      const narrowCols = line.length - 2;
      console.log('alt-screen resize to cols=', narrowCols);
      await resizeTerminal(window, narrowCols, rows);
      await window.waitForTimeout(400);

      const headRow0 = (await findRowContaining(window, '#60129404')) - 1;
      const dump = await dumpBuffer(window, Math.max(0, headRow0 - 1), headRow0 + 4);
      console.log('alt-screen post-reflow buffer:', JSON.stringify(dump, null, 2));

      const contLine = dump.lines.find(l => l.isWrapped && l.text.length > 0);
      expect(contLine, 'expected wrapped continuation row').toBeTruthy();
      const contRow1 = contLine!.idx + 1;
      const pt = await cellCenterPixel(window, contRow1, 1);
      console.log('alt-screen click continuation tail at', pt, 'row=', contRow1, 'text=', contLine!.text);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log('alt-screen wrapped click: open=', calls.length, 'urls=', calls.map(c => c.url), 'activates=', activates);
      expect(calls.length, 'wrapped URL click in alt-screen should fire window.open').toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('FIT-PATH: URL written wide, container shrunk to trigger fitAddon.fit reflow, click wrapped', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      const wideCols = await getCols(window);
      const url = 'https://microsoft.visualstudio.com/OS/_workitems/edit/60129404';
      const line = '| Apr 20 | #60129404 ( ' + url + ')';
      expect(line.length).toBeLessThan(wideCols);

      await writeToTerminal(window, '\r\n' + line + '\r\n');
      await window.waitForTimeout(400);

      // Shrink the .terminal-panel container so ResizeObserver triggers fit().
      // This is the actual code path real pane resize uses.
      const targetWidthPx = await window.evaluate(() => {
        const panel = document.querySelector('.terminal-panel') as HTMLElement;
        const rect = panel.getBoundingClientRect();
        // Cap container at ~60% width so URL wraps.
        return { current: rect.width, target: Math.floor(rect.width * 0.55) };
      });
      console.log('fit-path container resize:', targetWidthPx);

      await window.evaluate((w: number) => {
        const panel = document.querySelector('.terminal-panel') as HTMLElement;
        panel.style.width = w + 'px';
        panel.style.maxWidth = w + 'px';
        panel.style.flex = '0 0 ' + w + 'px';
      }, targetWidthPx.target);
      await window.waitForTimeout(800); // Let ResizeObserver + fit() settle.

      const colsAfterFit = await getCols(window);
      console.log('cols after container shrink:', colsAfterFit);

      const headRow0 = (await findRowContaining(window, '#60129404')) - 1;
      const dump = await dumpBuffer(window, Math.max(0, headRow0 - 1), headRow0 + 4);
      console.log('fit-path post-reflow buffer:', JSON.stringify(dump, null, 2));

      const contLine = dump.lines.find(l => l.isWrapped && l.text.length > 0);
      if (!contLine) {
        console.log('no wrapped continuation found - container shrink did not wrap the URL');
        // Fallback: dump everything for visibility, then fail with context.
        const wholeBuf = await dumpBuffer(window, 0, 30);
        console.log('full buffer:', JSON.stringify(wholeBuf, null, 2));
      }
      expect(contLine, 'expected wrapped continuation row after fit-path resize').toBeTruthy();
      const contRow1 = contLine!.idx + 1;
      const pt = await cellCenterPixel(window, contRow1, 1);
      console.log('fit-path click continuation at', pt, 'row=', contRow1, 'text=', contLine!.text);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log('fit-path wrapped click: open=', calls.length, 'urls=', calls.map(c => c.url), 'activates=', activates);
      expect(calls.length, 'wrapped URL click after fit-path reflow should fire window.open').toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('URL inside markdown-table-style row, reflowed narrow, click tail still opens', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      const wideCols = await getCols(window);
      const rows = await getRows(window);

      // Mimic the user's screenshot: a markdown table cell with text before
      // the URL (#60129404 ( <url>)) on one row, then narrow wraps it so the
      // closing digit + ) end up alone on the continuation row.
      const url = 'https://microsoft.visualstudio.com/OS/_workitems/edit/60129404';
      const line = '| Apr 20 | #60129404 ( ' + url + ')';
      expect(line.length).toBeLessThan(wideCols);

      await writeToTerminal(window, '\r\n' + line + '\r\n');
      await window.waitForTimeout(400);

      // Pick narrowCols so the URL wraps just before the trailing `4)`.
      // We want the tail to look like `4)` on its own row. Position of `4)`:
      // line.length-2 .. line.length-1. To make that fall on a 2nd row, set
      // narrowCols = line.length - 2 (so wrap point is at `4`).
      const narrowCols = line.length - 2;
      console.log('initial cols=', wideCols, 'rows=', rows, 'line.length=', line.length, 'narrowCols=', narrowCols);

      await resizeTerminal(window, narrowCols, rows);
      await window.waitForTimeout(400);

      const headRow0 = (await findRowContaining(window, '#60129404')) - 1;
      const dump = await dumpBuffer(window, Math.max(0, headRow0 - 1), headRow0 + 4);
      console.log('post-reflow buffer:', JSON.stringify(dump, null, 2));

      // Find the continuation row (isWrapped=true) and click somewhere inside
      // its content (the `4)` tail).
      const contLine = dump.lines.find(l => l.isWrapped && l.text.length > 0);
      expect(contLine).toBeTruthy();
      const contRow1 = contLine!.idx + 1;
      const clickCol = 1; // first char of continuation = the `4`
      const pt = await cellCenterPixel(window, contRow1, clickCol);
      console.log('clicking continuation tail at', pt, 'row1=', contRow1, 'col=', clickCol, 'text=', contLine!.text);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log('after click: open=', calls.length, 'urls=', calls.map(c => c.url), 'activates=', activates);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });

  test('URL written on one wide line then reflowed narrow still opens on click', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installWindowOpenSpy(window);
      await window.evaluate(() => { window.confirm = () => true; });

      const wideCols = await getCols(window);
      const rows = await getRows(window);
      console.log('initial cols=', wideCols, 'rows=', rows);

      // URL must fit on one line at wide cols, but wrap when we shrink to
      // narrowCols. Pick a length comfortably between the two.
      const url = 'https://example.com/task-106/' + 'x'.repeat(50);
      expect(url.length).toBeLessThan(wideCols);

      await writeToTerminal(window, '\r\nclick -> ' + url + '\r\n');
      await window.waitForTimeout(400);

      // Sanity: single-line click works.
      const wideRow = await findRowContaining(window, 'task-106');
      expect(wideRow).toBeGreaterThan(0);
      const widePt = await cellCenterPixel(window, wideRow, 'click -> '.length + 20);
      await window.mouse.move(widePt.x, widePt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(widePt.x, widePt.y);
      await window.waitForTimeout(400);
      let calls = await getOpenCalls(window);
      console.log('wide-state open calls:', calls.length, calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);

      await clearOpenCalls(window);

      // Force xterm reflow: shrink so the URL is guaranteed to wrap.
      const narrowCols = Math.min(50, Math.floor(url.length * 0.7));
      console.log('resizing to cols=', narrowCols);
      await resizeTerminal(window, narrowCols, rows);
      await window.waitForTimeout(400);

      // Diagnostic: dump the buffer rows that contain the URL post-reflow.
      const headRow0 = (await findRowContaining(window, 'task-106')) - 1;
      const dump = await dumpBuffer(window, Math.max(0, headRow0 - 1), headRow0 + 4);
      console.log('post-reflow buffer dump:', JSON.stringify(dump, null, 2));

      // The URL must now span at least two rows (head + continuation). The
      // continuation row(s) must have isWrapped=true for our soft-wrap walker
      // to stitch them into one logical URL.
      const urlLines = dump.lines.filter(l => l.text.includes('task-106') || l.isWrapped);
      console.log('lines that look like URL pieces:', urlLines);
      expect(urlLines.length).toBeGreaterThanOrEqual(2);

      // Click the CONTINUATION row (the wrapped tail of the URL) - this is
      // the spot the user reported as broken.
      const headRow1 = headRow0 + 1;
      const contRow1 = headRow1 + 1;
      const contPt = await cellCenterPixel(window, contRow1, 5);
      console.log('clicking continuation row at', contPt, 'row1=', contRow1);
      await window.mouse.move(contPt.x, contPt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(contPt.x, contPt.y);
      await window.waitForTimeout(500);

      calls = await getOpenCalls(window);
      const activates = await window.evaluate(
        () => (window as any).__tmaxLinkActivates || 0,
      );
      console.log(
        'after wrapped-continuation click: open calls=', calls.length,
        'urls=', calls.map(c => c.url),
        '__tmaxLinkActivates=', activates,
      );
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);

      await clearOpenCalls(window);

      // AC #1: resize BACK to wide so URL is one line again, click must still fire.
      console.log('resizing back to cols=', wideCols);
      await resizeTerminal(window, wideCols, rows);
      await window.waitForTimeout(400);

      const restoredRow = await findRowContaining(window, 'task-106');
      expect(restoredRow).toBeGreaterThan(0);
      const restoredPt = await cellCenterPixel(window, restoredRow, 'click -> '.length + 20);
      await window.mouse.move(restoredPt.x, restoredPt.y);
      await window.waitForTimeout(150);
      await window.mouse.click(restoredPt.x, restoredPt.y);
      await window.waitForTimeout(500);

      calls = await getOpenCalls(window);
      console.log('post-restore open calls:', calls.length, calls.map(c => c.url));
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe(url);
    } finally {
      await close();
    }
  });
});
