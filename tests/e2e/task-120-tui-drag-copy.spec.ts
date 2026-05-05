// TASK-120: drag-select copy when mouse reporting is on (Copilot CLI / Claude
// Code). When a TUI enables SGR mouse reporting, xterm forwards the drag to
// the pty - so xterm has no native selection. Before the fix, right-click
// after such a drag was a no-op (correct: don't paste) but also didn't copy,
// so the next paste leaked the previous clipboard. The fix snapshots the
// text under the drag rectangle from xterm's buffer at mouseup, and right-
// click then copies that snapshot to the system clipboard.
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

test('TASK-120: drag-select with mouse reporting on, right-click copies the dragged text', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Enable SGR mouse reporting (?1000h ?1006h) like a TUI would, and write
    // some recognisable text on the line we're going to drag across.
    await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h\r\nDRAG_TARGET_120\r\n');
    await window.waitForTimeout(300);

    // Focus the terminal
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    // Pre-load the clipboard with content we should NOT see after the copy.
    await setClipboard(window, '__STALE_CLIPBOARD__');
    await window.waitForTimeout(100);

    const coords = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry?.terminal;
      const dim = (term as any)._core?._renderService?.dimensions;
      const cw = dim?.css?.cell?.width ?? dim?.actualCellWidth ?? 9;
      const ch = dim?.css?.cell?.height ?? dim?.actualCellHeight ?? 18;
      const screen = document.querySelector('.terminal-panel .xterm-screen') as HTMLElement;
      const rect = screen.getBoundingClientRect();
      // DRAG_TARGET_120 is 15 chars long, on row 1 (after \r\n).
      const startX = rect.left + 1;
      const endX = rect.left + cw * 15 + cw * 0.6;
      const y = rect.top + ch * 1.5;
      return { startX, endX, y };
    });

    // Drag across the text. Mouse reporting should consume it - no xterm
    // selection should result.
    await window.mouse.move(coords.startX, coords.y);
    await window.mouse.down();
    await window.mouse.move(coords.endX, coords.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(200);

    const hadSelection = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      return entry?.terminal.hasSelection() ?? false;
    });
    expect(hadSelection, 'mouse reporting should consume the drag').toBe(false);

    // Right-click - should copy the dragged text (read from buffer) and NOT
    // paste the stale clipboard contents.
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(400);

    const clip = await getClipboard(window);
    expect(
      clip,
      `clipboard should now contain DRAG_TARGET_120 from the buffer-snapshot copy; got: ${JSON.stringify(clip)}`,
    ).toContain('DRAG_TARGET_120');
    expect(clip).not.toBe('__STALE_CLIPBOARD__');
  } finally {
    await close();
  }
});

test('TASK-120: double-click word selection + right-click copies the word (not paste of stale clipboard)', async () => {
  // User reported: drag-select works, but selecting a word via double-click
  // and then right-clicking pastes the prior clipboard. The right-click
  // mousedown clears xterm's selection before contextmenu fires, so by then
  // hasSelection() is false. Fix: snapshot the selection on mousedown(2)
  // BEFORE it can be cleared.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await writeToTerminal(window, '\r\nDOUBLECLICK_WORD_120\r\n');
    await window.waitForTimeout(300);

    // Pre-load the clipboard with content we should NOT see after the copy.
    await setClipboard(window, '__STALE_CLIPBOARD_DC__');
    await window.waitForTimeout(100);

    // Use xterm's API to create a word-style selection at the known position
    // (avoids relying on Playwright's double-click hitting the right glyph).
    const selected = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry?.terminal;
      if (!term) return false;
      term.select(0, 1, 'DOUBLECLICK_WORD_120'.length);
      return term.hasSelection();
    });
    expect(selected, 'expected xterm selection after .select()').toBe(true);

    // Right-click - the snapshot in mousedown(2) should preserve the
    // selection text even if xterm clears it before contextmenu fires.
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(400);

    const clip = await getClipboard(window);
    expect(
      clip,
      `clipboard should contain DOUBLECLICK_WORD_120; got: ${JSON.stringify(clip)}`,
    ).toContain('DOUBLECLICK_WORD_120');
    expect(clip).not.toBe('__STALE_CLIPBOARD_DC__');
  } finally {
    await close();
  }
});

test('TASK-120: a quick second right-click after a copy does NOT paste back into the prompt', async () => {
  // Regression for the user-reported follow-up: after the first right-click
  // copies, an immediate second right-click used to fall through to the paste
  // branch (no selection, no pending TUI snapshot) and dump the just-copied
  // text into the prompt below. A short post-copy paste guard suppresses it.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.evaluate(() => {
      (window as any).__ptyWrites = [];
      const orig = (window as any).terminalAPI.writePty.bind((window as any).terminalAPI);
      (window as any).terminalAPI.writePty = (id: string, data: string) => {
        (window as any).__ptyWrites.push({ id, data });
        return orig(id, data);
      };
    });

    await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      entry?.terminal.write('\x1b[?1000h\x1b[?1006h\r\nDOUBLE_TAP_120\r\n');
    });
    await window.waitForTimeout(300);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const coords = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry?.terminal;
      const dim = (term as any)._core?._renderService?.dimensions;
      const cw = dim?.css?.cell?.width ?? dim?.actualCellWidth ?? 9;
      const ch = dim?.css?.cell?.height ?? dim?.actualCellHeight ?? 18;
      const screen = document.querySelector('.terminal-panel .xterm-screen') as HTMLElement;
      const rect = screen.getBoundingClientRect();
      const startX = rect.left + 1;
      const endX = rect.left + cw * 14 + cw * 0.6;
      const y = rect.top + ch * 1.5;
      return { startX, endX, y };
    });

    await window.mouse.move(coords.startX, coords.y);
    await window.mouse.down();
    await window.mouse.move(coords.endX, coords.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(150);

    // Reset the spy so we only see what right-clicks do.
    await window.evaluate(() => { (window as any).__ptyWrites = []; });

    // First right-click: should copy.
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(150);
    // Second right-click within the post-copy guard window: must NOT paste.
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(400);

    const writes = await window.evaluate(() => (window as any).__ptyWrites.slice() as Array<{ data: string }>);
    const pasted = writes.map(w => w.data).join('');
    expect(
      pasted,
      `second right-click must not paste the just-copied text; pty got: ${JSON.stringify(pasted)}`,
    ).toBe('');
  } finally {
    await close();
  }
});

test('TASK-120: right-click without a preceding drag still pastes (no regression)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const PAYLOAD = 'PASTE_ME_120';
    await setClipboard(window, PAYLOAD);
    await window.waitForTimeout(100);

    // No drag - just a right-click.
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(800);

    const bufferText = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry?.terminal;
      if (!term) return '';
      const lines: string[] = [];
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i)?.translateToString(true) ?? '';
        if (line.trim()) lines.push(line);
      }
      return lines.join('\n');
    });

    expect(bufferText.includes(PAYLOAD), `expected paste, got buffer tail: ${bufferText.slice(-200)}`).toBe(true);
  } finally {
    await close();
  }
});
