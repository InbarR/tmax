// Regression test: right-click in a terminal with mouse reporting active
// and text on the clipboard must NOT auto-paste. When mouse reporting is on,
// drag-select is consumed by the pty (forwarded as SGR events), so xterm
// never creates a selection. The user thinks they selected text, but
// hasSelection() is false — causing the paste branch to fire erroneously.
//
// This test verifies the fix: when mouseTrackingOn is true and there is no
// xterm selection, right-click is a no-op (user can still Ctrl+V explicitly).
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function installPtyWriteSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__ptyWrites = [];
    const orig = (window as any).terminalAPI.writePty.bind((window as any).terminalAPI);
    (window as any).terminalAPI.writePty = (id: string, data: string) => {
      (window as any).__ptyWrites.push({ id, data });
      return orig(id, data);
    };
  });
}

async function getPastedText(window: Page): Promise<string> {
  const writes = await window.evaluate(() => (window as any).__ptyWrites.slice() as Array<{ id: string; data: string }>);
  return writes.map(w => w.data).join('');
}

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function setClipboard(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => (window as any).terminalAPI.clipboardWrite(t), text);
}

test('right-click with mouse reporting on and text clipboard does NOT paste', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    // Enable SGR mouse reporting (?1000h ?1006h) as a TUI app would
    await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h\r\nSELECTABLE_TEXT\r\n');
    await window.waitForTimeout(300);

    // Focus the terminal
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    // Put text on the clipboard (simulates a previous copy from elsewhere)
    const CLIPBOARD_PAYLOAD = 'SHOULD_NOT_BE_PASTED';
    await setClipboard(window, CLIPBOARD_PAYLOAD);
    await window.waitForTimeout(100);

    // Drag across the terminal text — with mouse reporting on, xterm forwards
    // the drag to the pty as SGR events and does NOT create a selection.
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
    await window.waitForTimeout(250);

    // Confirm xterm has no selection (mouse reporting swallowed the drag)
    const sel = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      return entry?.terminal.hasSelection() ?? false;
    });
    expect(sel, 'mouse reporting should consume drag — no xterm selection').toBe(false);

    // Reset spy to only track what right-click does
    await window.evaluate(() => { (window as any).__ptyWrites = []; });

    // Right-click — should NOT paste the clipboard text
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(500);

    const pasted = await getPastedText(window);
    expect(
      pasted,
      `pty must not receive clipboard text on right-click when mouse reporting is on; got: ${JSON.stringify(pasted)}`
    ).toBe('');
  } finally {
    await close();
  }
});

test('right-click with mouse reporting OFF still pastes normally', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    // No mouse reporting — normal terminal (PSReadLine may enable ?1003h,
    // but with no preceding drag, paste should still fire)

    // Focus terminal
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const CLIPBOARD_PAYLOAD = 'PASTE_ME_E2E';
    await setClipboard(window, CLIPBOARD_PAYLOAD);
    await window.waitForTimeout(100);

    // Right-click with no selection should paste
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(1000);

    // Verify by reading the terminal buffer — the payload should be visible
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

    expect(
      bufferText.includes(CLIPBOARD_PAYLOAD),
      `terminal buffer should contain pasted text; got: ${JSON.stringify(bufferText.slice(-200))}`
    ).toBe(true);
  } finally {
    await close();
  }
});
