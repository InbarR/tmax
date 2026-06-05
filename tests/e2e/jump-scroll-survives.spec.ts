// Repro for "jump-to-prompt doesn't scroll": jump-to-prompt scrolls the
// buffer via term.scrollLines(delta). TASK-180's syncBufferToScrollbar
// listener fires on every scroll event and maps scrollTop -> scrollToLine;
// if it reads a stale scrollTop right after a programmatic scroll it could
// undo the jump. This asserts a programmatic scroll-up sticks.
import { test, expect } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

test('a programmatic scrollLines(-N) is not undone by the scrollbar sync', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(2500);

    const state = await getStoreState(window);
    const id = state.terminalIds[0];

    await window.evaluate((tid) => {
      const term = (window as any).__getTerminalEntry(tid).terminal;
      const lines: string[] = [];
      for (let i = 0; i < 300; i++) lines.push(`scroll-line-${i.toString().padStart(4, '0')}`);
      term.write('\r\n' + lines.join('\r\n') + '\r\n');
    }, id);
    await window.waitForTimeout(400);

    const before = await window.evaluate((tid) => {
      const term = (window as any).__getTerminalEntry(tid).terminal;
      term.scrollToBottom();
      const buf = term.buffer.active;
      const target = Math.max(0, buf.baseY - 60);
      term.scrollLines(target - buf.viewportY); // mimic jump-to-prompt recenter
      return { baseY: buf.baseY, target, immediate: buf.viewportY };
    }, id);

    // Let the scroll event + syncBufferToScrollbar settle.
    await window.waitForTimeout(300);

    const after = await window.evaluate((tid) => {
      return (window as any).__getTerminalEntry(tid).terminal.buffer.active.viewportY;
    }, id);

    expect(before.immediate).toBe(before.target);       // scrollLines moved it
    expect(after).toBe(before.target);                  // and it STAYED there
  } finally {
    await close();
  }
});
