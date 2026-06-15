import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-240: two AI-CLI-pane regressions reported on macOS for v1.11.0.
//
// 1. Re-selection: in an AI CLI pane (mouse tracking on) tmax synthesizes a
//    text selection on left-drag because xterm forwards the drag to the app.
//    The synth path was gated on !term.hasSelection(), so once a selection
//    existed a SECOND drag was ignored and the old selection stuck - the only
//    way to re-select was to type into the prompt (which redraws and clears
//    it). Fix: clear an existing selection on left-mousedown so the next drag
//    starts fresh, like a regular terminal.
//
// 2. Alternate-scroll: an app on the ALTERNATE screen that does NOT hold the
//    mouse (a pager, or an AI CLI / Ink TUI running without mouse tracking)
//    has no xterm scrollback to move, so the wheel did nothing. Real terminals
//    translate the wheel into arrow keys (DECCKM-aware). tmax now does too.

async function focusedId(window: Page): Promise<string> {
  return window.evaluate(() => {
    const s = (window as any).__terminalStore.getState();
    return (s.focusedTerminalId ?? [...s.terminals.keys()][0]) as string;
  });
}

async function writeTo(window: Page, id: string, text: string) {
  await window.evaluate(({ id, text }: { id: string; text: string }) => {
    (window as any).__getTerminalEntry(id)?.terminal.write(text);
  }, { id, text });
}

async function markAsAiPane(window: Page, id: string) {
  await window.evaluate((id: string) => {
    const store = (window as any).__terminalStore;
    const s = store.getState();
    const next = new Map(s.terminals);
    const t = next.get(id);
    if (t) next.set(id, { ...t, aiSessionId: 'test-ai-session' });
    store.setState({ terminals: next });
  }, id);
}

async function selectionPos(window: Page, id: string): Promise<{ sy: number; sx: number } | null> {
  return window.evaluate((id: string) => {
    const term = (window as any).__getTerminalEntry(id)?.terminal;
    if (!term?.hasSelection()) return null;
    const p = term.getSelectionPosition();
    return p ? { sy: p.start.y, sx: p.start.x } : null;
  }, id);
}

// Drag horizontally along a row at the given fraction of the screen height,
// so the resulting selection sits on a predictable, single buffer row.
async function dragRow(window: Page, yFrac: number) {
  const box = await window.locator('.xterm-screen').first().boundingBox();
  if (!box) throw new Error('no .xterm-screen box');
  const y = box.y + box.height * yFrac;
  const x0 = box.x + 12;
  const x1 = box.x + Math.min(box.width - 12, 160);
  await window.mouse.move(x0, y);
  await window.mouse.down();
  await window.mouse.move((x0 + x1) / 2, y);
  await window.mouse.move(x1, y);
  await window.mouse.up();
}

async function startPtyCapture(window: Page) {
  await window.evaluate(() => {
    (window as any).__ptyWrites = [];
    const api = (window as any).terminalAPI;
    if (!api.__patchedForCapture) {
      const orig = api.writePty.bind(api);
      api.writePty = (id: string, data: string) => {
        (window as any).__ptyWrites.push({ id, data });
        return orig(id, data);
      };
      api.__patchedForCapture = true;
    }
  });
}

async function ptyWrites(window: Page): Promise<string[]> {
  return window.evaluate(() => ((window as any).__ptyWrites as Array<{ data: string }>).map((w) => w.data));
}

async function terminalCenter(window: Page): Promise<{ x: number; y: number }> {
  return window.evaluate(() => {
    const screen = document.querySelector('.terminal-panel .xterm-screen') as HTMLElement;
    const r = screen.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

test.describe('TASK-240: AI-pane re-selection', () => {
  test('a second drag replaces the first selection (no need to type to clear)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await focusedId(window);
      await markAsAiPane(window, id);
      // AI CLI pane: alternate screen + mouse tracking (copilot/claude-like).
      await writeTo(window, id, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      let body = '';
      for (let i = 0; i < 12; i++) body += `row-${String(i).padStart(2, '0')}-content\r\n`;
      await writeTo(window, id, body);
      await window.waitForTimeout(150);

      // First drag near the top.
      await dragRow(window, 0.15);
      await window.waitForTimeout(200); // synth select() is deferred a tick
      const first = await selectionPos(window, id);
      expect(first, 'first drag should produce a selection').not.toBeNull();

      // Second drag lower down WITHOUT clearing first. Pre-fix this was a
      // no-op (gated on !hasSelection), leaving the original selection.
      await dragRow(window, 0.6);
      await window.waitForTimeout(200);
      const second = await selectionPos(window, id);
      expect(second, 'second drag should still leave a selection').not.toBeNull();
      expect(second!.sy, `selection should move to the new row (first=${first!.sy} second=${second!.sy})`)
        .not.toBe(first!.sy);
    } finally { await close(); }
  });
});

test.describe('TASK-240: alternate-scroll-mode parity', () => {
  test('wheel sends arrow keys on the alt screen when the app is not tracking the mouse', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await focusedId(window);
      // Pager-like: alternate screen, NO mouse tracking.
      await writeTo(window, id, '\x1b[?1049h');
      await writeTo(window, id, 'pager content\r\n');
      await window.waitForTimeout(120);
      await startPtyCapture(window);

      const c = await terminalCenter(window);
      await window.mouse.move(c.x, c.y);
      await window.mouse.wheel(0, 120); // wheel down
      await window.waitForTimeout(120);
      let writes = await ptyWrites(window);
      expect(writes.join(''), 'wheel down should emit Down-arrow(s)').toContain('\x1b[B');

      await window.evaluate(() => { (window as any).__ptyWrites = []; });
      await window.mouse.wheel(0, -120); // wheel up
      await window.waitForTimeout(120);
      writes = await ptyWrites(window);
      expect(writes.join(''), 'wheel up should emit Up-arrow(s)').toContain('\x1b[A');
    } finally { await close(); }
  });

  test('respects DECCKM: application cursor keys -> SS3 arrow encoding', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await focusedId(window);
      await writeTo(window, id, '\x1b[?1049h\x1b[?1h'); // alt screen + application cursor keys
      await window.waitForTimeout(120);
      await startPtyCapture(window);

      const c = await terminalCenter(window);
      await window.mouse.move(c.x, c.y);
      await window.mouse.wheel(0, 120);
      await window.waitForTimeout(120);
      const writes = (await ptyWrites(window)).join('');
      expect(writes, 'DECCKM down arrow is SS3 O B, not CSI [ B').toContain('\x1bOB');
      expect(writes).not.toContain('\x1b[B');
    } finally { await close(); }
  });

  test('does NOT send arrows when the alt-screen app IS tracking the mouse (forwards instead)', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await focusedId(window);
      // Full-screen app holding the mouse: alt screen + mouse tracking.
      await writeTo(window, id, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      await window.waitForTimeout(120);
      await startPtyCapture(window);

      const c = await terminalCenter(window);
      await window.mouse.move(c.x, c.y);
      await window.mouse.wheel(0, 120);
      await window.waitForTimeout(120);
      const writes = (await ptyWrites(window)).join('');
      // Alternate-scroll must stay out of the way - the wheel is forwarded as a
      // real SGR mouse report, never as a bare arrow key.
      expect(writes, 'should not synthesize arrows while the app tracks the mouse').not.toContain('\x1b[B');
      expect(writes).not.toContain('\x1bOB');
    } finally { await close(); }
  });
});
