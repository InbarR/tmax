// TASK-180: dragging the xterm scrollbar didn't scroll the buffer, even
// though the mouse wheel did.
//
// Root cause (xterm 5.5): Viewport._handleScroll bails early when
// `!this._viewportElement.offsetParent`, which is the case whenever the
// terminal lives inside a `position: fixed` ancestor (focus-mode wrapper,
// floating panel, workspace grid). The native scrollbar still fires a
// `scroll` event, but xterm ignores it, so ydisp never moves. The wheel
// keeps working because TerminalPanel intercepts it directly via
// scrollLines().
//
// Fix (TerminalPanel.tsx): an independent `scroll` listener on
// .xterm-viewport maps scrollTop -> buffer line and calls term.scrollToLine().
// It has no offsetParent guard, so it scrolls the buffer where xterm bails.
//
// This test reproduces the bail condition by forcing the viewport to
// position:fixed (which nulls offsetParent), then drives a scrollbar-style
// scroll and asserts the buffer actually scrolled.
import { test, expect } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

test('scrollbar drag scrolls the buffer even when xterm Viewport bails (offsetParent null)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    // Seed enough scrollback that the buffer has real history (baseY > 0).
    await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      const lines: string[] = [];
      for (let i = 0; i < 300; i++) lines.push(`drag-line-${i.toString().padStart(4, '0')}`);
      term.write('\r\n' + lines.join('\r\n') + '\r\n');
    }, terminalId);
    await window.waitForTimeout(400);

    // Pin to the bottom, then reproduce the bug condition and perform a
    // scrollbar-style scroll up by ~60 rows.
    const probe = await window.evaluate((id) => {
      const entry = (window as any).__getTerminalEntry(id);
      const term = entry.terminal;
      term.scrollToBottom();
      const buf = term.buffer.active;
      const baseY = buf.baseY;
      const ydispAtBottom = buf.viewportY;
      const cellH = term._core._renderService.dimensions.css.cell.height;
      const vp = (entry.container || document).querySelector('.xterm-viewport') as HTMLElement;
      const rect = vp.getBoundingClientRect();

      // Reproduce the failure: make the viewport's offsetParent null (as it
      // is inside a position:fixed ancestor) so xterm's own _handleScroll
      // bails. Keep it visible and scrollable by pinning its box.
      vp.style.position = 'fixed';
      vp.style.top = `${rect.top}px`;
      vp.style.left = `${rect.left}px`;
      vp.style.width = `${rect.width}px`;
      vp.style.height = `${rect.height}px`;
      const offsetParentNull = vp.offsetParent === null;

      // Drag the scrollbar up: set scrollTop to a target row and fire the
      // scroll event the native scrollbar would emit.
      const targetLine = Math.max(0, baseY - 60);
      vp.scrollTop = targetLine * cellH;
      vp.dispatchEvent(new Event('scroll'));

      return { baseY, ydispAtBottom, cellH, targetLine, offsetParentNull, scrollTopSet: vp.scrollTop };
    }, terminalId);

    // Let the scroll handler + xterm refresh settle.
    await window.waitForTimeout(200);

    const after = await window.evaluate((id) => {
      const term = (window as any).__getTerminalEntry(id).terminal;
      return { ydisp: term.buffer.active.viewportY };
    }, terminalId);

    // Sanity: we genuinely reproduced the xterm-bail condition.
    expect(probe.offsetParentNull).toBe(true);
    // We started pinned at the bottom...
    expect(probe.ydispAtBottom).toBe(probe.baseY);
    // ...and the scrollbar drag moved the buffer up to (about) the target row.
    // Allow a 1-row tolerance for pixel rounding.
    expect(Math.abs(after.ydisp - probe.targetLine)).toBeLessThanOrEqual(1);
    // And it actually moved away from the bottom.
    expect(after.ydisp).toBeLessThan(probe.baseY);
  } finally {
    await close();
  }
});
