import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-164: in a detected AI CLI pane (copilot / claude), a plain left-drag
// should produce a real visible text selection like Windows Terminal, even
// though the app has mouse tracking on. Copilot runs on the ALTERNATE screen
// buffer with mouse tracking (verified via diag), so the gate keys on "is
// this an AI CLI pane" (store aiSessionId / aiProcessKind), NOT on buffer
// type. Real full-screen apps (vim/htop) have no AI session, so they keep
// their mouse. Copilot's mouse tracking is sticky / not reliably clearable
// (copilot-cli#2332), so tmax selects locally rather than fighting it.

async function setup(window: Page): Promise<string> {
  return window.evaluate(() => {
    const s = (window as any).__terminalStore.getState();
    return (s.focusedTerminalId ?? [...s.terminals.keys()][0]) as string;
  });
}

async function writeTo(window: Page, id: string, text: string) {
  await window.evaluate(({ id, text }: { id: string; text: string }) => {
    (window as any).__getTerminalEntry(id)?.terminal.write(text);
  }, { id, text });
}

async function markAsAiPane(window: Page, id: string) {
  await window.evaluate((id: string) => {
    const store = (window as any).__terminalStore;
    const s = store.getState();
    const next = new Map(s.terminals);
    const t = next.get(id);
    if (t) next.set(id, { ...t, aiSessionId: 'test-ai-session' });
    store.setState({ terminals: next });
  }, id);
}

async function hasSelection(window: Page, id: string): Promise<boolean> {
  return window.evaluate((id: string) =>
    !!(window as any).__getTerminalEntry(id)?.terminal.hasSelection(), id);
}

async function dragAcrossScreen(window: Page) {
  const box = await window.locator('.xterm-screen').first().boundingBox();
  if (!box) throw new Error('no .xterm-screen box');
  const x0 = box.x + 12, y0 = box.y + 6;
  const x1 = box.x + Math.min(box.width - 12, 180), y1 = box.y + 44;
  await window.mouse.move(x0, y0);
  await window.mouse.down();
  await window.mouse.move((x0 + x1) / 2, (y0 + y1) / 2);
  await window.mouse.move(x1, y1);
  await window.mouse.up();
}

test.describe('TASK-164: plain drag selects in AI CLI panes', () => {
  test('normal-buffer pane with mouse tracking: plain drag selects', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await setup(window);
      await writeTo(window, id, '\x1b[?1000h\x1b[?1006h');
      await writeTo(window, id, 'AAAAAAAAAAAA\r\nBBBBBBBBBBBB\r\nCCCCCCCCCCCC\r\n');
      await window.waitForTimeout(150);
      await dragAcrossScreen(window);
      await window.waitForTimeout(200);
      expect(await hasSelection(window, id)).toBe(true);
    } finally { await close(); }
  });

  test('AI pane on the ALTERNATE buffer (copilot-like): plain drag selects', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await setup(window);
      await markAsAiPane(window, id);
      // Copilot: alt screen + mouse tracking.
      await writeTo(window, id, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      await writeTo(window, id, 'copilot-line-1\r\ncopilot-line-2\r\ncopilot-line-3\r\n');
      await window.waitForTimeout(150);
      await dragAcrossScreen(window);
      await window.waitForTimeout(200);
      expect(await hasSelection(window, id), 'AI pane should select even on alt buffer').toBe(true);
    } finally { await close(); }
  });

  test('non-AI full-screen app on the ALTERNATE buffer (vim-like): plain drag does NOT select', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
      await window.waitForTimeout(600);
      const id = await setup(window);
      // No AI session marked. Alt screen + mouse tracking (vim with mouse).
      await writeTo(window, id, '\x1b[?1049h\x1b[?1000h\x1b[?1006h');
      await writeTo(window, id, 'vim-content-1\r\nvim-content-2\r\n');
      await window.waitForTimeout(150);
      await dragAcrossScreen(window);
      await window.waitForTimeout(200);
      expect(await hasSelection(window, id), 'non-AI alt-screen app keeps its mouse').toBe(false);
    } finally { await close(); }
  });
});
