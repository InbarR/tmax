// Alt-screen scroll-gating: tmax's xterm 5.5 viewport scroll-sync
// workarounds (wheelPreSyncHandler, wheelRecoveryHandler, wheelClampHandler,
// manualSyncHandler, syncBufferToScrollbar, computeScrolledAway) are written
// for the NORMAL scrollback buffer. Full-screen TUIs (vim, less, htop, and
// Copilot CLI's full-screen scrollbar) run in the ALTERNATE buffer, which has
// no scrollback and where the app owns its own scrolling. The workarounds are
// now gated on `term.buffer.active.type === 'normal'` so they stay out of the
// app's way instead of fighting it.
//
// Test 1 proves wheelPreSyncHandler does NOT mutate the viewport cache while
// in alt-screen (on the un-gated code it would force-resync and overwrite the
// staged cache value). Test 2 proves the floating jump-to-bottom arrow hides
// in alt-screen and reappears after the app exits alt-screen.
import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

async function writeTerm(window: Page, id: string, data: string): Promise<void> {
  await window.evaluate((args: { id: string; data: string }) => {
    const entry = (window as any).__getTerminalEntry(args.id);
    return new Promise<void>((resolve) => entry.terminal.write(args.data, () => resolve()));
  }, { id, data });
}

test('wheel in alt-screen does NOT force-sync the viewport cache', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    // Seed normal-buffer scrollback so the viewport has real geometry, then
    // scroll up off the bottom.
    const filler: string[] = [];
    for (let i = 0; i < 200; i++) filler.push(`base-line-${i.toString().padStart(4, '0')}`);
    await writeTerm(window, terminalId, '\r\n' + filler.join('\r\n') + '\r\n');
    await window.waitForTimeout(300);
    await window.evaluate((id) => {
      (window as any).__getTerminalEntry(id).terminal.scrollLines(-50);
    }, terminalId);
    await window.waitForTimeout(150);

    // Enter alt-screen + enable mouse tracking (what a full-screen TUI does).
    await writeTerm(window, terminalId, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
    await window.waitForTimeout(150);

    const result = await window.evaluate((id) => {
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry.terminal;
      const v: any = (term as any)._core.viewport;
      const vp = (entry.container || document).querySelector('.xterm-viewport') as HTMLElement;

      // Sanity: we are in the alternate buffer.
      const bufType = term.buffer.active.type;

      // Stage a cache lag the un-gated wheelPreSyncHandler would "fix":
      // bufLen > _lastRecordedBufferLength triggers a force-resync that
      // overwrites this sentinel. The gate must make it a no-op.
      const altLen = term.buffer.active.length;
      const sentinel = Math.max(0, altLen - 20);
      v._lastRecordedBufferLength = sentinel;

      const beforeViewportY = term.buffer.active.viewportY;

      const ev = new WheelEvent('wheel', {
        deltaY: 100000,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      });
      vp.dispatchEvent(ev);

      return { bufType, sentinel, afterRecorded: v._lastRecordedBufferLength, beforeViewportY };
    }, terminalId);

    // Let any rAF the un-gated path would schedule settle.
    await window.waitForTimeout(200);

    const after = await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      const v: any = (term as any)._core.viewport;
      return { recorded: v._lastRecordedBufferLength, viewportY: term.buffer.active.viewportY };
    }, terminalId);

    // We must actually be in alt-screen for the test to be meaningful.
    expect(result.bufType).toBe('alternate');
    // The gated wheelPreSyncHandler bailed: the staged cache value is intact.
    // On the un-gated code this would be -1 or the recomputed buffer length.
    expect(result.afterRecorded).toBe(result.sentinel);
    expect(after.recorded).toBe(result.sentinel);
    // wheelClampHandler did not yank the alt-screen view.
    expect(after.viewportY).toBe(result.beforeViewportY);
  } finally {
    await close();
  }
});

test('jump-to-bottom arrow hides in alt-screen and reappears on exit', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    const filler: string[] = [];
    for (let i = 0; i < 200; i++) filler.push(`away-line-${i.toString().padStart(4, '0')}`);
    await writeTerm(window, terminalId, '\r\n' + filler.join('\r\n') + '\r\n');
    await window.waitForTimeout(300);

    // Scroll up so the normal buffer is "scrolled away" → arrow appears.
    await window.evaluate((id) => {
      (window as any).__getTerminalEntry(id).terminal.scrollLines(-50);
    }, terminalId);
    // > 750ms scroll-away poll so React state settles regardless of events.
    await window.waitForTimeout(900);
    expect(await window.locator('.terminal-jump-to-bottom').count()).toBe(1);

    // Enter alt-screen: the arrow must hide (no scrollback to be away from).
    await writeTerm(window, terminalId, '\x1b[?1049h');
    await window.waitForTimeout(900);
    expect(await window.locator('.terminal-jump-to-bottom').count()).toBe(0);

    // Exit alt-screen: normal-buffer scroll position is restored, so the
    // arrow reappears within one poll cycle.
    await writeTerm(window, terminalId, '\x1b[?1049l');
    await window.waitForTimeout(900);
    expect(await window.locator('.terminal-jump-to-bottom').count()).toBe(1);
  } finally {
    await close();
  }
});
