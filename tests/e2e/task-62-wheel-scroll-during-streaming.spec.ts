// TASK-62: mouse wheel scroll-down stops before the live prompt during a
// running session.
//
// Cause (xterm 5.5): Viewport caches buffer length on a rAF-debounced
// refresh, so during continuous PTY output the .xterm-viewport scrollHeight
// (driven by _lastRecordedBufferHeight) lags the real buffer by a frame.
// The browser clamps scrollTop against the stale scrollHeight, leaving the
// user one or more lines above the bottom even after a vigorous wheel-down.
//
// Fix lives in TerminalPanel.tsx: a capture-phase wheel listener pre-syncs
// the viewport when buffer.length > _lastRecordedBufferLength, so the
// browser sees a fresh scrollHeight when it performs the default scroll.
import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

async function muzzlePtyEcho(window: Page, terminalId: string): Promise<void> {
  await window.evaluate((id) => {
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry.terminal;
    const orig = term.write.bind(term);
    (window as any).__origWrite = orig;
    let allow = false;
    (window as any).__allowWrite = (v: boolean) => { allow = v; };
    term.write = (data: any, cb?: any) => {
      if (allow) return orig(data, cb);
      if (cb) cb();
    };
  }, terminalId);
}

async function writeRaw(window: Page, blob: string): Promise<void> {
  await window.evaluate((b: string) => {
    return new Promise<void>((resolve) => {
      const allowFn: any = (window as any).__allowWrite;
      const orig: any = (window as any).__origWrite;
      allowFn(true);
      orig(b, () => { allowFn(false); resolve(); });
    });
  }, blob);
}

// Reproduces the user-visible bug: streaming new lines, scrolled-up
// viewport, wheel-down should land on the live prompt line. We stage the
// xterm Viewport cache lag deterministically (in production it lags
// because _innerRefresh is rAF-debounced) and then dispatch a wheel event
// followed by the equivalent of a browser native scroll. With the bug,
// scrollTop clamps against the stale scrollHeight; with the fix, the
// capture-phase pre-sync refreshes the cache before the clamp happens.
test('wheel-down during streaming PTY data reaches the live prompt line', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    await muzzlePtyEcho(window, terminalId);

    // Seed scrollback with enough lines that the viewport has scroll.
    const filler: string[] = [];
    for (let i = 0; i < 200; i++) filler.push(`base-line-${i.toString().padStart(4, '0')}`);
    await writeRaw(window, '\r\n' + filler.join('\r\n') + '\r\n');
    await window.waitForTimeout(300);

    // Scroll up so we're not glued to the bottom.
    await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      term.scrollLines(-50);
    }, terminalId);
    await window.waitForTimeout(150);

    // Stream NEW lines, end with the live prompt marker, stage the cache
    // lag, then dispatch the wheel + native scroll-clamp - all
    // synchronously, so the bug shape is deterministic.
    const result = await window.evaluate((args) => {
      const { id, marker } = args;
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry.terminal;
      const v: any = (term as any)._core.viewport;
      const orig: any = (window as any).__origWrite;
      const allowFn: any = (window as any).__allowWrite;
      const vp = (entry.container || document).querySelector('.xterm-viewport') as HTMLElement;

      allowFn(true);
      for (let i = 0; i < 8; i++) {
        const more: string[] = [];
        for (let j = 0; j < 6; j++) more.push(`stream-line-${i}-${j}`);
        const last = i === 7;
        const tail = last ? `\r\n${marker} > ` : '';
        orig('\r\n' + more.join('\r\n') + tail);
      }
      allowFn(false);

      // Stage the cache lag: pin _lastRecordedBufferLength + scrollArea
      // height to a value the live buffer has already overshot. This is
      // exactly the state the user hits in production during streaming
      // (cache updates run on rAF, behind the actual buffer).
      const buf = term.buffer.active;
      const realLen = buf.length;
      const lagLines = 20;
      v._lastRecordedBufferLength = Math.max(0, realLen - lagLines);
      const rowH = v._currentRowHeight || 17;
      const staleHeight = Math.round(v._lastRecordedBufferLength * rowH);
      v._lastRecordedBufferHeight = staleHeight;
      v._scrollArea.style.height = staleHeight + 'px';

      const beforeWheel = {
        bufferLength: realLen,
        recordedBufferLength: v._lastRecordedBufferLength,
        scrollHeight: vp.scrollHeight,
        clientHeight: vp.clientHeight,
        scrollTop: vp.scrollTop,
        ydisp: buf.viewportY,
        baseY: buf.baseY,
        rows: term.rows,
      };

      // Dispatch the wheel event. Our capture-phase pre-sync listener
      // (TerminalPanel.tsx) should run BEFORE the default scroll and
      // refresh the cache so the upcoming clamp uses fresh dimensions.
      const ev = new WheelEvent('wheel', {
        deltaY: 100000,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      });
      vp.dispatchEvent(ev);

      // Simulate the browser default scroll action that follows the wheel:
      // scrollTop += deltaY, clamped by the (now hopefully-refreshed)
      // scrollHeight. JS-dispatched WheelEvents don't trigger the default
      // scroll, so we mimic it explicitly here.
      const targetScrollTop = vp.scrollTop + ev.deltaY;
      vp.scrollTop = Math.min(targetScrollTop, vp.scrollHeight - vp.clientHeight);

      return {
        before: beforeWheel,
        afterRecorded: v._lastRecordedBufferLength,
        afterScrollHeight: vp.scrollHeight,
        afterScrollTop: vp.scrollTop,
      };
    }, { id: terminalId, marker: 'TASK62_LIVE_PROMPT_LINE' });
    console.log('staging + wheel:', result);

    // Let xterm's scroll handler + any rAF settle so ydisp updates from
    // the new scrollTop.
    await window.waitForTimeout(200);

    const after = await window.evaluate((id) => {
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry.terminal;
      const buf = term.buffer.active;
      let liveRow = -1;
      for (let i = 0; i < buf.length; i++) {
        const ln = buf.getLine(i);
        if (ln && ln.translateToString(true).includes('TASK62_LIVE_PROMPT_LINE')) liveRow = i;
      }
      return {
        ydisp: buf.viewportY,
        baseY: buf.baseY,
        rows: term.rows,
        liveRow,
      };
    }, terminalId);
    console.log('after settle:', after);

    // Pre-sync should have refreshed the cache to the real buffer length.
    expect(result.afterRecorded).toBe(result.before.bufferLength);

    // The wheel-down brought the viewport to the live prompt line.
    // ydisp == baseY means the very last buffer line is at the top of the
    // viewport, so the prompt (a few rows above it) is visible.
    expect(after.ydisp).toBe(after.baseY);
    expect(after.liveRow).toBeGreaterThanOrEqual(after.ydisp);
    expect(after.liveRow).toBeLessThanOrEqual(after.ydisp + after.rows - 1);
  } finally {
    await close();
  }
});

// Negative test: an idle terminal (no streaming, no buffer growth since
// last sync) must follow the existing fast path. The pre-sync handler
// should NOT trigger when buffer.length === _lastRecordedBufferLength,
// so we verify the cached value is unchanged after a wheel event.
test('wheel scroll on an idle terminal does not force-sync', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    await muzzlePtyEcho(window, terminalId);

    // Seed lines, then wait long enough for the viewport cache to settle
    // (rAF + a margin).
    const filler: string[] = [];
    for (let i = 0; i < 100; i++) filler.push(`idle-line-${i}`);
    await writeRaw(window, '\r\n' + filler.join('\r\n') + '\r\n');
    await window.waitForTimeout(500);

    const before = await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      const v: any = (term as any)._core.viewport;
      return {
        recorded: v._lastRecordedBufferLength,
        bufLen: term.buffer.active.length,
      };
    }, terminalId);

    expect(before.recorded).toBe(before.bufLen);

    // Mark the cache so we can detect spurious invalidation.
    await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      const v: any = (term as any)._core.viewport;
      (window as any).__sentinelBefore = v._lastRecordedBufferLength;
    }, terminalId);

    // Dispatch wheel-up. Pre-sync should bail (bufLen !> recorded).
    await window.evaluate((id) => {
      const entry = (window as any).__getTerminalEntry(id);
      const vp = (entry.container || document).querySelector('.xterm-viewport') as HTMLElement;
      const ev = new WheelEvent('wheel', {
        deltaY: -100,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      });
      vp.dispatchEvent(ev);
    }, terminalId);

    const after = await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      const v: any = (term as any)._core.viewport;
      return {
        recorded: v._lastRecordedBufferLength,
        bufLen: term.buffer.active.length,
        sentinel: (window as any).__sentinelBefore,
      };
    }, terminalId);

    // Cache should still match the buffer length (pre-sync did not erroneously
    // wipe it to -1) and equal the sentinel value captured pre-wheel.
    expect(after.recorded).toBe(after.bufLen);
    expect(after.recorded).toBe(after.sentinel);
  } finally {
    await close();
  }
});
