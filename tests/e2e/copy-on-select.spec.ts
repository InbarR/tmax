// Copy-on-select: selecting text with the mouse writes it to the clipboard on
// mouse-up, so no Ctrl+C / right-click is needed. This is additive - Ctrl+C
// still sends ^C/SIGINT when there's nothing selected (covered by the TASK-261
// specs). These tests drag with the real mouse and read the real clipboard,
// asserting the copy happened with no follow-up copy gesture at all.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function getClipboard(window: Page): Promise<string> {
  return window.evaluate(() => (window as any).terminalAPI.clipboardRead());
}

async function setClipboard(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => (window as any).terminalAPI.clipboardWrite(t), text);
}

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

// Locate the marker's real position in the buffer and return drag coordinates
// spanning it. Data-driven (not a hardcoded row) so a busy prompt / MOTD that
// shifts the marker down doesn't make the drag miss - which would leave the
// clipboard stale and fail for the wrong reason.
async function dragCoordsForMarker(window: Page, marker: string) {
  return window.evaluate((mk: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry?.terminal;
    const buf = term.buffer.active;
    let row = -1;
    let col = -1;
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)?.translateToString(true) ?? '';
      const idx = line.indexOf(mk);
      if (idx >= 0) { row = i; col = idx; break; }
    }
    if (row < 0) return null;
    const dim = (term as any)._core?._renderService?.dimensions;
    const cw = dim?.css?.cell?.width ?? dim?.actualCellWidth ?? 9;
    const ch = dim?.css?.cell?.height ?? dim?.actualCellHeight ?? 18;
    const screen = document.querySelector('.terminal-panel .xterm-screen') as HTMLElement;
    const rect = screen.getBoundingClientRect();
    const viewportRow = row - buf.viewportY;
    const startX = rect.left + cw * (col + 0.2);
    const endX = rect.left + cw * (col + mk.length) + cw * 0.6;
    const y = rect.top + ch * (viewportRow + 0.5);
    return { startX, endX, y };
  }, marker);
}

test('copy-on-select: native drag selection copies on mouse-up (no Ctrl+C, no right-click)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Normal buffer, no mouse reporting: a drag makes a real xterm selection.
    await writeToTerminal(window, '\r\nSELECT_ONSELECT_A\r\n');
    await window.waitForTimeout(300);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    await setClipboard(window, '__STALE_ONSELECT_A__');
    await window.waitForTimeout(100);

    const coords = await dragCoordsForMarker(window, 'SELECT_ONSELECT_A');
    expect(coords, 'marker SELECT_ONSELECT_A should be found in the buffer').not.toBeNull();

    await window.mouse.move(coords!.startX, coords!.y);
    await window.mouse.down();
    await window.mouse.move(coords!.endX, coords!.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(300);

    // No Ctrl+C, no right-click - the mouse-up alone should have copied.
    const clip = await getClipboard(window);
    expect(
      clip,
      `copy-on-select should put SELECT_ONSELECT_A on the clipboard at mouse-up; got: ${JSON.stringify(clip)}`,
    ).toContain('SELECT_ONSELECT_A');
    expect(clip).not.toBe('__STALE_ONSELECT_A__');
  } finally {
    await close();
  }
});

test('copy-on-select: mouse-reporting TUI drag copies on mouse-up (no gesture)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // SGR mouse reporting on: xterm forwards the drag, so there's no native
    // selection - copy-on-select must fall back to the buffer snapshot.
    await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h\r\nSELECT_ONSELECT_B\r\n');
    await window.waitForTimeout(300);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    await setClipboard(window, '__STALE_ONSELECT_B__');
    await window.waitForTimeout(100);

    const coords = await dragCoordsForMarker(window, 'SELECT_ONSELECT_B');
    expect(coords, 'marker SELECT_ONSELECT_B should be found in the buffer').not.toBeNull();

    await window.mouse.move(coords!.startX, coords!.y);
    await window.mouse.down();
    await window.mouse.move(coords!.endX, coords!.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(300);

    const clip = await getClipboard(window);
    expect(
      clip,
      `copy-on-select should copy the TUI-drag snapshot SELECT_ONSELECT_B at mouse-up; got: ${JSON.stringify(clip)}`,
    ).toContain('SELECT_ONSELECT_B');
    expect(clip).not.toBe('__STALE_ONSELECT_B__');
  } finally {
    await close();
  }
});
