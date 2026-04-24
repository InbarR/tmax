import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readDiagLog(userDataDir: string): string {
  const path = join(userDataDir, 'tmax-diag.log');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function findPtyWritesSince(log: string, marker: string): string[] {
  const idx = log.lastIndexOf(marker);
  const tail = idx >= 0 ? log.slice(idx) : log;
  return tail.split(/\r?\n/).filter((l) => l.includes(' pty:write '));
}

async function logMarker(window: Page, marker: string): Promise<void> {
  await window.evaluate((m: string) => (window as any).terminalAPI.diagLog(m), marker);
}

async function getClipboard(window: Page): Promise<string> {
  return window.evaluate(() => (window as any).terminalAPI.clipboardRead());
}

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    entry?.terminal.write(t);
  }, text);
}

async function selectInTerminal(window: Page, col: number, row: number, length: number): Promise<boolean> {
  return window.evaluate(({ col, row, length }) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    if (!entry) return false;
    entry.terminal.select(col, row, length);
    return entry.terminal.hasSelection();
  }, { col, row, length });
}

async function getTerminalSelection(window: Page): Promise<string> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    return entry?.terminal.getSelection() || '';
  });
}

test('plain Enter with a selection copies to clipboard and does NOT send CR to PTY (#71)', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    // Write known text into the terminal via the xterm API directly
    await writeToTerminal(window, '\r\nSELECT_ME_71_XXXX\r\n');
    await window.waitForTimeout(300);

    // Focus terminal and select the known text
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const hasSelection = await selectInTerminal(window, 0, 1, 17);
    expect(hasSelection).toBe(true);

    const sel = await getTerminalSelection(window);
    console.log('xterm selection:', JSON.stringify(sel));
    expect(sel).toContain('SELECT_ME_71');

    // Clear clipboard before pressing Enter so we can verify the copy.
    await window.evaluate(() => (window as any).terminalAPI.clipboardWrite(''));

    const marker = `e2e:enter:${Date.now()}`;
    await logMarker(window, marker);
    await window.waitForTimeout(100);

    await window.keyboard.press('Enter');
    await window.waitForTimeout(500);

    const clip = await getClipboard(window);
    console.log('clipboard after Enter:', JSON.stringify(clip));

    const log = readDiagLog(userDataDir);
    const writes = findPtyWritesSince(log, marker);
    console.log('pty:write lines after Enter press:', writes.length);
    for (const l of writes) console.log('  ', l);

    expect(clip).toContain('SELECT_ME_71');
    // With a selection, Enter should NOT send anything to the PTY.
    // Any 1-byte write would indicate a CR leaked through.
    const oneByteWrite = writes.some((l) => /"bytes":1\b/.test(l));
    expect(oneByteWrite).toBe(false);

    // And the selection should be cleared after the copy
    const stillSelected = await window.evaluate(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const entry = (window as any).__getTerminalEntry(id);
      return entry?.terminal.hasSelection();
    });
    expect(stillSelected).toBe(false);
  } finally {
    await close();
  }
});

test('plain Enter without a selection still sends CR to PTY (#71 regression guard)', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const marker = `e2e:enter-nosel:${Date.now()}`;
    await logMarker(window, marker);
    await window.waitForTimeout(100);

    await window.keyboard.press('Enter');
    await window.waitForTimeout(400);

    const log = readDiagLog(userDataDir);
    const writes = findPtyWritesSince(log, marker);
    console.log('writes after plain Enter (no selection):', writes.length);
    for (const l of writes) console.log('  ', l);

    // Without a selection, plain Enter should send exactly 1 byte (CR)
    // to the PTY. Previews are gone from diag logs after PR #55, so match
    // by bytes count.
    const sentCR = writes.some((l) => /"bytes":1\b/.test(l));
    expect(sentCR).toBe(true);
  } finally {
    await close();
  }
});
