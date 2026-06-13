import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Repro for "copies upside down" in a regular (non-TUI) terminal: write three
// distinct lines, select them, and check the order getSelection() returns.
test('regular pane: selection returns lines top-to-bottom (not reversed)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(700);

    const result = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const id = s.focusedTerminalId ?? [...s.terminals.keys()][0];
      const term = (window as any).__getTerminalEntry(id).terminal;
      // Write enough lines to create real scrollback (baseY > 0), like pwsh.
      let payload = '';
      for (let i = 1; i <= 200; i++) payload += `LINE_${String(i).padStart(3, '0')}\r\n`;
      await new Promise<void>((resolve) => term.write(payload, () => resolve()));
      await new Promise((r) => setTimeout(r, 400));
      const baseY = term.buffer.active.baseY;
      term.selectAll();
      const sel = term.getSelection();
      term.clearSelection();
      return { sel, baseY };
    });

    const lines = result.sel.split('\n').map((l: string) => l.trim()).filter(Boolean);
    // eslint-disable-next-line no-console
    console.log('\n[copy-order] baseY=' + result.baseY + ' first lines:', JSON.stringify(lines.slice(0, 4)), 'last:', JSON.stringify(lines.slice(-4)), '\n');

    const i1 = lines.findIndex((l: string) => l.includes('LINE_001'));
    const i200 = lines.findIndex((l: string) => l.includes('LINE_200'));
    expect(result.baseY, 'should have scrollback').toBeGreaterThan(0);
    expect(i1, 'LINE_001 present').toBeGreaterThanOrEqual(0);
    expect(i200, 'LINE_200 present').toBeGreaterThanOrEqual(0);
    expect(i1, 'LINE_001 must come BEFORE LINE_200 (not reversed/upside-down)').toBeLessThan(i200);
  } finally {
    await close();
  }
});
