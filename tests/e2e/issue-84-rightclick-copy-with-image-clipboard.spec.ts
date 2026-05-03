// Issue #84 follow-up: right-click in a terminal with mouse reporting on
// must NOT auto-paste a saved-PNG path when the clipboard is image-only.
//
// Repro reported by user: Claude Code TUI was running (or had recently run)
// with SGR mouse reporting enabled. User dragged across text expecting to
// select it, then right-clicked expecting copy. Because mouse reporting is
// on, xterm forwards the drag to the pty instead of creating a selection,
// so handleContextMenu sees hasSelection()===false and falls through to the
// paste branch. The clipboard happened to hold a PNG from a prior tmax
// clipboard save, so the saved-image file path was pasted into the active
// prompt - never what the user wanted.
//
// Fix (Option A in issue thread): when there is no selection AND the
// clipboard is image-only (no plain text, no HTML), do nothing. Ctrl+V
// still pastes images for users who want that explicitly.
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

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

async function seedImageOnly(app: ElectronApplication, dataUrl: string): Promise<void> {
  await app.evaluate(({ clipboard, nativeImage }, args) => {
    clipboard.clear();
    clipboard.writeImage(nativeImage.createFromDataURL(args.dataUrl));
  }, { dataUrl });
}

async function getClipboardText(window: Page): Promise<string> {
  return window.evaluate(() => (window as any).terminalAPI.clipboardRead());
}

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

test('issue #84: right-click with mouse reporting + image-only clipboard does not paste the saved-PNG path', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    // Enable SGR mouse reporting (?1000h ?1006h) the way Claude Code /
    // vim / less do, then write a known phrase. With mouse reporting on,
    // the drag below will be forwarded to the pty and xterm will NOT
    // create a selection - matching the user's actual environment.
    const PHRASE = 'WINDOWS_IS_FINE_84';
    await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h\r\n' + PHRASE + '\r\n');
    await window.waitForTimeout(300);

    // Focus the terminal first so the helper textarea is settled.
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(150);

    // Compute pixel coords for a drag across the phrase.
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
      const endX = rect.left + cw * 18 + cw * 0.6; // 18 chars
      const y = rect.top + ch * 1.5; // row 1 (post-\r\n)
      return { startX, endX, y };
    });

    // Drag across the text. With mouse reporting on, the drag is forwarded
    // to the pty as SGR mouse events; xterm does NOT create a selection.
    // Reset the pty write spy AFTER the drag so we only count what the
    // right-click does.
    await window.mouse.move(coords.startX, coords.y);
    await window.mouse.down();
    await window.mouse.move(coords.endX, coords.y, { steps: 10 });
    await window.mouse.up();
    await window.waitForTimeout(250);

    const sel = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      return { has: !!entry?.terminal.hasSelection(), text: entry?.terminal.getSelection() ?? '' };
    });
    // Sanity: with mouse reporting on, drag should not produce an xterm
    // selection. If this ever flips, the test stops covering the bug shape.
    expect(sel.has, `mouse reporting should swallow the drag; got selection="${sel.text}"`).toBe(false);

    // Seed clipboard with image-only - matches user's setup (a tmax clipboard
    // PNG saved earlier was still on the clipboard at right-click time).
    await seedImageOnly(app, TINY_PNG_DATA_URL);
    await window.waitForTimeout(100);
    await window.evaluate(() => { (window as any).__ptyWrites = []; });

    // Right-click on the same area.
    await window.mouse.move(coords.startX + 20, coords.y);
    await window.mouse.down({ button: 'right' });
    await window.mouse.up({ button: 'right' });
    await window.waitForTimeout(500);

    const clip = await getClipboardText(window);
    const pasted = await getPastedText(window);

    // The fix: nothing pasted to the pty. (Pre-fix: a saved-PNG file path
    // was written via writePty, polluting the active prompt.)
    expect(pasted, `pty must not receive an image-path paste on right-click; got: ${JSON.stringify(pasted)}`).toBe('');
    // Clipboard text stays empty - the image is still there but no text was
    // copied (there was no real selection to copy).
    expect(clip, `clipboard text should remain empty; got: ${JSON.stringify(clip)}`).toBe('');
  } finally {
    await close();
  }
});
