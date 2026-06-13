import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { TERMINAL_RECOVER_SEQUENCE } from '../../src/renderer/utils/terminal-recover';

// TASK-162 / TASK-163. Inline (Ink-based) TUIs - Copilot CLI, Claude Code -
// enable mouse tracking AND switch to the alternate-screen buffer, then are
// expected to restore both on exit. When one is killed (Ctrl+C) or crashes,
// it dies before sending the matching resets. The pre-existing fix only
// reset mouse modes on alt-screen EXIT (?1049l) - but a TUI that dies without
// ever sending ?1049l leaves the pane STUCK on the alt buffer:
//   - the alt buffer has no scrollback, so the wheel can't scroll (dead scroll)
//   - the alt buffer still shows the TUI's last paint (a black slab over the
//     prompt - TASK-163)
//   - mouse tracking stays on (dead drag-select)
//
// The recovery sequence (manual "Reset Terminal" command + the AI-process-gone
// auto path) must therefore exit alt-screen and reset SGR, not just mouse modes.

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function getTerminalState(window: Page): Promise<{ bufferType: string; mouseOn: boolean }> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry.terminal;
    const core = (term as any)._core;
    const svc = core?._coreMouseService || core?.coreMouseService;
    const protocol = svc?.activeProtocol || 'NONE';
    return {
      bufferType: term.buffer.active.type as string,
      mouseOn: protocol !== 'NONE',
    };
  });
}

test.describe('TASK-162/163: recover a pane stuck on the alt-screen by a dead TUI', () => {
  test('recovery sequence exits a stuck alt-screen and clears mouse tracking', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(500);

      // Simulate a live TUI: enter alt-screen + enable mouse tracking.
      await writeToTerminal(window, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      await window.waitForTimeout(150);

      let state = await getTerminalState(window);
      expect(state.bufferType).toBe('alternate');
      expect(state.mouseOn).toBe(true);

      // Simulate the TUI dying WITHOUT sending ?1049l (Ctrl+C / crash). The
      // pane is now stuck: alt-screen never exited, mouse tracking still on.
      // (Some unrelated shell output lands in the alt buffer, like a prompt.)
      await writeToTerminal(window, 'PS C:\\> ');
      await window.waitForTimeout(100);

      state = await getTerminalState(window);
      expect(state.bufferType).toBe('alternate'); // still stuck
      expect(state.mouseOn).toBe(true);

      // Apply the exact shipped recovery sequence (what the manual command and
      // the AI-gone auto path both write).
      await writeToTerminal(window, TERMINAL_RECOVER_SEQUENCE);
      await window.waitForTimeout(150);

      state = await getTerminalState(window);
      // Back on the normal buffer -> scrollback restored (wheel works) and the
      // black alt-buffer fill is gone.
      expect(state.bufferType).toBe('normal');
      // Mouse tracking cleared -> drag-select works.
      expect(state.mouseOn).toBe(false);
    } finally {
      await close();
    }
  });

  test('recovery on an already-normal buffer is a harmless no-op', async () => {
    // Regression guard: running recovery on a healthy plain-shell pane must
    // not toggle anything weird - it should stay on the normal buffer with
    // mouse tracking off.
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(500);

      let state = await getTerminalState(window);
      expect(state.bufferType).toBe('normal');

      await writeToTerminal(window, TERMINAL_RECOVER_SEQUENCE);
      await window.waitForTimeout(150);

      state = await getTerminalState(window);
      expect(state.bufferType).toBe('normal');
      expect(state.mouseOn).toBe(false);
    } finally {
      await close();
    }
  });
});
