// TASK-107: Ctrl+click on .md path fails when path contains spaces or wraps
// across rows.
//
// Two stacked bugs we ship one fix for:
//   A) regex excluded \s from the path body so any space (e.g. "OneDrive -
//      Microsoft") cut the match short.
//   B) the xterm link provider for .md paths read only one buffer row, so a
//      soft-wrapped path was either invisible (head row had no .md) or
//      degraded into a bare-tail filename (which then resolved to a wrong
//      file under cwd).
//
// These specs exercise both: a single-line path with spaces, and a long path
// forced to wrap across two+ rows by sheer length.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate(async (t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    await new Promise<void>((resolve) => {
      entry.terminal.write(t, () => resolve());
    });
  }, text);
}

async function getCols(window: Page): Promise<number> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    return (window as any).__getTerminalEntry(id).terminal.cols;
  });
}

async function setTerminalCwd(window: Page, cwd: string): Promise<void> {
  await window.evaluate((c: string) => {
    const store = (window as any).__terminalStore;
    const id = store.getState().focusedTerminalId;
    const terms: Map<string, any> = new Map(store.getState().terminals);
    const entry = terms.get(id);
    if (entry) {
      terms.set(id, { ...entry, cwd: c });
      store.setState({ terminals: terms });
    }
  }, cwd);
}

// Force fileRead to succeed without touching disk so the link provider's
// activate() reaches the markdownPreview store update we want to assert.
async function installFileReadSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__fileReadCalls = [];
    const api = (window as any).terminalAPI;
    Object.defineProperty(api, 'fileRead', {
      value: async (p: string) => {
        (window as any).__fileReadCalls.push(p);
        return 'mock-content';
      },
      configurable: true,
      writable: true,
    });
  });
}

async function getFileReadCalls(window: Page): Promise<string[]> {
  return window.evaluate(() => ((window as any).__fileReadCalls || []).slice());
}

async function resetFileReadCalls(window: Page): Promise<void> {
  await window.evaluate(() => { (window as any).__fileReadCalls = []; });
}

async function getMarkdownPreview(window: Page): Promise<{ filePath: string; fileName: string } | null> {
  return window.evaluate(() => {
    const mp = (window as any).__terminalStore.getState().markdownPreview;
    return mp ? { filePath: mp.filePath, fileName: mp.fileName } : null;
  });
}

async function getLinksOnRow(window: Page, row1Based: number): Promise<Array<{ text: string; startX: number; endX: number; startY: number; endY: number }>> {
  return window.evaluate(async (r: number) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const term = (window as any).__getTerminalEntry(id).terminal;
    const core = (term as any)._core;
    const service = core?._linkProviderService;
    const providers = service?.linkProviders || service?._linkProviders || [];
    const out: any[] = [];
    for (const p of providers) {
      await new Promise<void>((resolve) => {
        try {
          p.provideLinks(r, (links: any) => {
            if (links) {
              for (const l of links) {
                out.push({
                  text: l.text,
                  startX: l.range?.start?.x,
                  endX: l.range?.end?.x,
                  startY: l.range?.start?.y,
                  endY: l.range?.end?.y,
                });
              }
            }
            resolve();
          });
        } catch { resolve(); }
      });
    }
    return out;
  }, row1Based);
}

async function findRowsWithText(window: Page, needle: string): Promise<Array<{ y: number; text: string; isWrapped: boolean }>> {
  return window.evaluate((s: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const term = (window as any).__getTerminalEntry(id).terminal;
    const buf = term.buffer.active;
    const out: Array<{ y: number; text: string; isWrapped: boolean }> = [];
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.includes(s)) out.push({ y: y + 1, text, isWrapped: line.isWrapped });
    }
    return out;
  }, needle);
}

async function cellPixel(window: Page, y1Based: number, col1Based: number): Promise<{ x: number; y: number }> {
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
    return {
      x: Math.round(rect.left + (c - 1) * cellW + cellW / 2),
      y: Math.round(rect.top + viewportRow * cellH + cellH / 2),
    };
  }, { y: y1Based, c: col1Based });
}

// Park the cursor far below any prompt so shell prompt redraws can't clobber
// the row our test wrote into. issue-62/xterm-soft-wrap-copy use the same
// trick.
async function parkCursorAt(window: Page, row: number, col: number = 1): Promise<void> {
  await writeToTerminal(window, `\x1b[${row};${col}H`);
}

test.describe('TASK-107: .md path click survives spaces and soft-wrap', () => {
  test('single-line path with spaces (OneDrive - Microsoft) - click opens preview with full path', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installFileReadSpy(window);

      const cols = await getCols(window);
      // Pick a path short enough to fit on one row at default cols, but with
      // spaces in two distinct segments so the OLD regex would have stopped
      // at the first space.
      const path = `C:\\OneDrive - Microsoft\\Vault One\\note.md`;
      expect(path.length).toBeLessThan(cols);

      await parkCursorAt(window, 30, 1);
      await writeToTerminal(window, 'p: ' + path);
      await window.waitForTimeout(300);

      const rows = await findRowsWithText(window, 'note.md');
      expect(rows.length).toBe(1);
      const y = rows[0].y;

      const links = await getLinksOnRow(window, y);
      const mdLinks = links.filter(l => l.text.endsWith('note.md'));
      console.log('single-line spaces - link texts on row:', links.map(l => l.text));
      expect(mdLinks.length).toBe(1);
      expect(mdLinks[0].text).toBe(path);

      // Click on a column INSIDE the spacey middle (where old regex would
      // have already given up), past 'p: '.
      const clickCol = 'p: '.length + path.indexOf('OneDrive') + 5;
      const pt = await cellPixel(window, y, clickCol);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getFileReadCalls(window);
      console.log('fileRead calls (single-line):', calls);
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(path);

      const preview = await getMarkdownPreview(window);
      expect(preview).not.toBeNull();
      expect(preview!.filePath).toBe(path);
      expect(preview!.fileName).toBe('note.md');
    } finally {
      await close();
    }
  });

  test('soft-wrapped path - click on EITHER row reconstructs full path and opens preview', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installFileReadSpy(window);

      const cols = await getCols(window);
      // Build a path long enough to span at least two rows. Use the user's
      // exact repro shape: drive prefix, OneDrive - Microsoft segment,
      // multi-segment middle, .md suffix.
      const filler = 'segment-'.repeat(Math.ceil(cols / 8));
      const path = `c:\\Users\\inrotem\\OneDrive - Microsoft\\Documents\\${filler}\\blue squad.md`;
      expect(path.length).toBeGreaterThan(cols);

      await parkCursorAt(window, 30, 1);
      await writeToTerminal(window, path);
      await window.waitForTimeout(400);

      // Find every buffer row that holds part of the path.
      const allRows = await findRowsWithText(window, 'blue squad.md');
      const headRows = await findRowsWithText(window, 'inrotem');
      const allTouched = [...new Set([...allRows.map(r => r.y), ...headRows.map(r => r.y)])].sort((a, b) => a - b);
      console.log('rows touching path:', allTouched);
      expect(allTouched.length).toBeGreaterThanOrEqual(2);

      // Continuation rows must be flagged isWrapped, otherwise xterm didn't
      // soft-wrap and our walk would have nothing to do (test would lie).
      const wrapInfo = await window.evaluate((rows: number[]) => {
        const id = (window as any).__terminalStore.getState().focusedTerminalId;
        const term = (window as any).__getTerminalEntry(id).terminal;
        const buf = term.buffer.active;
        return rows.map(y => ({ y, isWrapped: buf.getLine(y - 1)?.isWrapped }));
      }, allTouched);
      console.log('wrap info:', wrapInfo);
      expect(wrapInfo.slice(1).every(r => r.isWrapped === true)).toBe(true);

      // Each touched row must register a link whose text is the FULL
      // reconstructed path - that's the new soft-wrap walk doing its job.
      for (const y of allTouched) {
        const links = await getLinksOnRow(window, y);
        const mdLinks = links.filter(l => l.text.endsWith('blue squad.md'));
        console.log(`row ${y} md links:`, mdLinks);
        expect(mdLinks.length).toBeGreaterThanOrEqual(1);
        expect(mdLinks[0].text).toBe(path);
        // Range must be clipped to this row only (multi-row range causes
        // xterm to fire activate once per row).
        expect(mdLinks[0].startY).toBe(y);
        expect(mdLinks[0].endY).toBe(y);
      }

      // Click on the HEAD row (first touched) at a column that's clearly
      // inside the path. fileRead should fire with the FULL path.
      await resetFileReadCalls(window);
      const headY = allTouched[0];
      const headPt = await cellPixel(window, headY, 5);
      await window.mouse.move(headPt.x, headPt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(headPt.x, headPt.y);
      await window.waitForTimeout(500);

      let calls = await getFileReadCalls(window);
      console.log('fileRead after head-row click:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(path);

      // Click on the TAIL row (last touched) - same path must come through.
      await resetFileReadCalls(window);
      await window.evaluate(() => { (window as any).__terminalStore.setState({ markdownPreview: null }); });
      const tailY = allTouched[allTouched.length - 1];
      const tailPt = await cellPixel(window, tailY, 5);
      await window.mouse.move(tailPt.x, tailPt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(tailPt.x, tailPt.y);
      await window.waitForTimeout(500);

      calls = await getFileReadCalls(window);
      console.log('fileRead after tail-row click:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(path);

      const preview = await getMarkdownPreview(window);
      expect(preview).not.toBeNull();
      expect(preview!.filePath).toBe(path);
      expect(preview!.fileName).toBe('blue squad.md');
    } finally {
      await close();
    }
  });

  test('bare README.md still resolves against cwd (regression guard)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installFileReadSpy(window);

      const cwd = 'C:\\fake\\cwd';
      await setTerminalCwd(window, cwd);

      await parkCursorAt(window, 30, 1);
      await writeToTerminal(window, 'see README.md for details');
      await window.waitForTimeout(300);

      const rows = await findRowsWithText(window, 'README.md');
      expect(rows.length).toBe(1);
      const y = rows[0].y;

      const links = await getLinksOnRow(window, y);
      const mdLinks = links.filter(l => l.text === 'README.md');
      expect(mdLinks.length).toBe(1);

      const pt = await cellPixel(window, y, 'see '.length + 3);
      await window.mouse.move(pt.x, pt.y);
      await window.waitForTimeout(120);
      await window.mouse.click(pt.x, pt.y);
      await window.waitForTimeout(500);

      const calls = await getFileReadCalls(window);
      console.log('bare README calls:', calls);
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe('C:\\fake\\cwd\\README.md');
    } finally {
      await close();
    }
  });

  test('two adjacent .md paths on one line stay separate', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installFileReadSpy(window);

      // Two anchored paths with a space between. Lazy +? in alt 1 must stop
      // at the first .md\b so the second path is a separate match.
      const a = 'C:\\a\\note.md';
      const b = 'C:\\b\\other.md';
      await parkCursorAt(window, 30, 1);
      await writeToTerminal(window, a + ' ' + b);
      await window.waitForTimeout(300);

      const rows = await findRowsWithText(window, 'other.md');
      expect(rows.length).toBe(1);
      const y = rows[0].y;

      const links = await getLinksOnRow(window, y);
      const mdTexts = links.filter(l => l.text.endsWith('.md')).map(l => l.text);
      console.log('two-path link texts:', mdTexts);
      expect(mdTexts).toContain(a);
      expect(mdTexts).toContain(b);
      expect(mdTexts.length).toBe(2);
    } finally {
      await close();
    }
  });
});
