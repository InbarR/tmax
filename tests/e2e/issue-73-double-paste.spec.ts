import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function setClipboard(window: Page, text: string): Promise<void> {
  await window.evaluate((t: string) => {
    const api = (window as any).terminalAPI;
    api.clipboardWrite(t);
  }, text);
}

function readDiagLog(userDataDir: string): string {
  const path = join(userDataDir, 'tmax-diag.log');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function countPtyWritesContaining(log: string, sinceMarker: string, substring: string): number {
  const idx = log.lastIndexOf(sinceMarker);
  const tail = idx >= 0 ? log.slice(idx) : log;
  const lines = tail.split(/\r?\n/).filter((l) => l.includes(' pty:write '));
  let count = 0;
  for (const line of lines) {
    const m = line.match(/preview":"([^"]*)"/);
    const preview = m ? m[1] : '';
    const decoded = preview
      .replace(/\\\\n/g, '\n')
      .replace(/\\\\r/g, '\r')
      .replace(/\\\\t/g, '\t');
    if (decoded.includes(substring)) count++;
  }
  return count;
}

async function logMarker(window: Page, marker: string): Promise<void> {
  await window.evaluate((m: string) => {
    (window as any).terminalAPI.diagLog(m);
  }, marker);
}

test('Ctrl+V writes paste payload to PTY exactly once', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(1000);

    const payload = 'HELLO_PASTE_73_UNIQUE';
    await setClipboard(window, payload);
    await window.waitForTimeout(200);

    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(300);

    const marker = `e2e:marker:${Date.now()}`;
    await logMarker(window, marker);
    await window.waitForTimeout(150);

    await window.keyboard.press('Control+v');
    await window.waitForTimeout(800);

    const log = readDiagLog(userDataDir);
    const count = countPtyWritesContaining(log, marker, payload);

    console.log('Payload pty:write count after Ctrl+V:', count);
    const sinceMarker = log.slice(log.lastIndexOf(marker));
    const writeLines = sinceMarker.split('\n').filter((l) => l.includes('pty:write'));
    console.log('pty:write lines since marker:');
    for (const line of writeLines.slice(0, 20)) console.log('  ', line);

    expect(count).toBe(1);
  } finally {
    await close();
  }
});
