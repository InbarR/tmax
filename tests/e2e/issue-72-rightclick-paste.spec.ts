import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function setClipboard(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => (window as any).terminalAPI.clipboardWrite(t), text);
}

function readDiagLog(userDataDir: string): string {
  const path = join(userDataDir, 'tmax-diag.log');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function countPtyWritesWithBytes(log: string, sinceMarker: string, expectedBytes: number): number {
  const idx = log.lastIndexOf(sinceMarker);
  const tail = idx >= 0 ? log.slice(idx) : log;
  const lines = tail.split(/\r?\n/).filter((l) => l.includes(' pty:write '));
  let count = 0;
  for (const line of lines) {
    const m = line.match(/"bytes":(\d+)/);
    if (m && parseInt(m[1], 10) === expectedBytes) count++;
  }
  return count;
}

async function logMarker(window: Page, marker: string): Promise<void> {
  await window.evaluate((m: string) => (window as any).terminalAPI.diagLog(m), marker);
}

test('right-click on terminal with no selection pastes clipboard once', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const payload = 'RIGHT_CLICK_PASTE_72';
    await setClipboard(window, payload);
    await window.waitForTimeout(200);

    // First left-click to focus the terminal
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const marker = `e2e:rc:${Date.now()}`;
    await logMarker(window, marker);
    await window.waitForTimeout(100);

    // Right-click on the terminal screen
    await window.click('.terminal-panel .xterm-screen', { button: 'right' });
    await window.waitForTimeout(600);

    const log = readDiagLog(userDataDir);
    const count = countPtyWritesWithBytes(log, marker, payload.length);

    console.log('right-click pty:write count with payload length:', count);
    const sinceMarker = log.slice(log.lastIndexOf(marker));
    const writeLines = sinceMarker.split('\n').filter((l) => l.includes('pty:write'));
    for (const line of writeLines.slice(0, 10)) console.log('  ', line);

    expect(count).toBe(1);
  } finally {
    await close();
  }
});
