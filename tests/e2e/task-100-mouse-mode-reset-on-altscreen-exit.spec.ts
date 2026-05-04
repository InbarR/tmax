import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TUIs (Claude Code, Copilot CLI) enable xterm mouse tracking modes
// (\x1b[?1000h / ?1002h / ?1006h) when they start, then send the matching
// reset on graceful shutdown. When the user kills them with Ctrl+C, the
// process dies before the reset reaches xterm - so xterm keeps forwarding
// mouse events to the (now-dead) PTY and drag-select stops working.
//
// Tmax detects alt-screen exit (\x1b[?1049l) and force-resets the mouse
// modes if any were active; the user can drag-select again immediately.

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function getXtermMouseMode(window: Page): Promise<{ x10: boolean; vt200: boolean; vt200Hilite: boolean; btnEvent: boolean; anyEvent: boolean; sgr: boolean }> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    const term = entry.terminal;
    const core = (term as any)._core;
    // xterm.js exposes mouse modes through its CoreMouseService; we peek at
    // the active protocol name as the source of truth.
    const svc = core?._coreMouseService || core?.coreMouseService;
    const protocol = svc?.activeProtocol || 'NONE';
    return {
      x10: protocol === 'X10',
      vt200: protocol === 'VT200',
      vt200Hilite: protocol === 'VT200_HIGHLIGHT',
      btnEvent: protocol === 'BTN_EVENT' || protocol === 'DRAG',
      anyEvent: protocol === 'ANY_EVENT',
      sgr: false, // SGR is an encoding, not a protocol; tracked separately
    };
  });
}

async function isAnyMouseTrackingOn(window: Page): Promise<boolean> {
  const m = await getXtermMouseMode(window);
  return m.x10 || m.vt200 || m.vt200Hilite || m.btnEvent || m.anyEvent;
}

test.describe('TASK: mouse-mode reset on alt-screen exit', () => {
  test('alt-screen exit force-resets leftover mouse tracking', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(500);

      // Simulate a TUI starting: enter alt-screen + enable mouse tracking.
      await writeToTerminal(window, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      await window.waitForTimeout(150);

      // Sanity: mouse tracking should be active now.
      expect(await isAnyMouseTrackingOn(window)).toBe(true);

      // Simulate the TUI dying via Ctrl+C - the process exits before
      // sending ?1000l/?1006l, but the shell or some path still emits
      // ?1049l to leave alt-screen. (Many shells don't, but our fix
      // hooks on alt-screen exit specifically; a bare-newline-only kill
      // is a separate worse case.)
      await writeToTerminal(window, '\x1b[?1049l');
      await window.waitForTimeout(150);

      // Tmax should have detected the alt-screen exit + leftover mouse
      // mode and written reset sequences to xterm.
      expect(await isAnyMouseTrackingOn(window)).toBe(false);
    } finally {
      await close();
    }
  });

  test('alt-screen exit without mouse modes does NOT inject extra resets', async () => {
    // Sanity: if the TUI cleanly exited mouse modes BEFORE alt-screen,
    // nothing should change. Regression guard for the fix being too eager.
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(500);

      // Enter alt-screen, enable then DISABLE mouse tracking, then exit.
      await writeToTerminal(window, '\x1b[?1049h\x1b[?1000h');
      await window.waitForTimeout(100);
      expect(await isAnyMouseTrackingOn(window)).toBe(true);
      await writeToTerminal(window, '\x1b[?1000l');
      await window.waitForTimeout(100);
      expect(await isAnyMouseTrackingOn(window)).toBe(false);
      await writeToTerminal(window, '\x1b[?1049l');
      await window.waitForTimeout(150);

      // Still off - no double reset, no toggle.
      expect(await isAnyMouseTrackingOn(window)).toBe(false);
    } finally {
      await close();
    }
  });

  test('mouse modes set OUTSIDE alt-screen are NOT reset', async () => {
    // A non-alt-screen app that uses mouse modes (rare but legal) should
    // not have its modes reset by us. We only act on alt-screen EXIT.
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(500);

      await writeToTerminal(window, '\x1b[?1000h\x1b[?1006h');
      await window.waitForTimeout(150);
      expect(await isAnyMouseTrackingOn(window)).toBe(true);

      // Some unrelated output, no alt-screen toggle.
      await writeToTerminal(window, 'hello world\r\n');
      await window.waitForTimeout(150);

      // Mouse modes still on - we didn't touch them.
      expect(await isAnyMouseTrackingOn(window)).toBe(true);
    } finally {
      await close();
    }
  });
});
