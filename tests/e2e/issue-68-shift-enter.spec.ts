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

test('Shift+Enter sends a multi-line-newline sequence (not plain CR) so apps can insert a newline (#68)', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const marker = `e2e:shift-enter:${Date.now()}`;
    await logMarker(window, marker);
    await window.waitForTimeout(100);

    await window.keyboard.press('Shift+Enter');
    await window.waitForTimeout(500);

    const log = readDiagLog(userDataDir);
    const writes = findPtyWritesSince(log, marker);
    console.log('pty:write lines after Shift+Enter:');
    for (const l of writes) console.log('  ', l);

    // Sum the bytes of all pty:write entries since the marker. Shift+Enter
    // should emit exactly 2 bytes: ESC + CR (\x1b\r). A broken handler would
    // emit 1 byte (just \r).
    const totalBytes = writes.reduce((acc, l) => {
      const m = l.match(/"bytes":(\d+)/);
      return acc + (m ? parseInt(m[1], 10) : 0);
    }, 0);
    expect(writes.length).toBeGreaterThan(0);
    expect(totalBytes).toBe(2);
  } finally {
    await close();
  }
});
