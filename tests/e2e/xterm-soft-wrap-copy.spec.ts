import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-33 regression: ensure xterm soft-wrapped lines (long lines with
// no \n in the data, just exceeding terminal width) are joined into a
// single logical line on copy - no \n inserted at the wrap point.
//
// User reported pasted snippets had spurious \n at visual wrap points
// (e.g. "Allow rebinding" -> "Al\nlow rebinding"). This test confirms
// xterm's getSelection correctly distinguishes soft wraps (isWrapped on
// continuation rows -> joined on copy) from hard newlines (\n in the
// data -> preserved on copy). When the symptom recurs, the cause is the
// SOURCE inserting real \n into the PTY stream (typical for AI tools
// that hand-wrap their prose to terminal width); tmax is faithfully
// preserving what was emitted.

test('xterm soft wrap is detected and joined on copy (TASK-33)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForFunction(() => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      return id && !!(window as any).__getTerminalEntry?.(id);
    }, null, { timeout: 10_000 });

    // Write the payload AND read state in a single evaluate so the pwsh
    // shell can't redraw between write and inspect. Use the term.write
    // callback to wait synchronously for the data to land in the buffer.
    const inspection = await window.evaluate(async () => {
      const id = (window as any).__terminalStore.getState().focusedTerminalId;
      const term = (window as any).__getTerminalEntry(id).terminal;
      const cols = term.cols;
      const seed = 'WORD-A WORD-B WORD-C WORD-D WORD-E WORD-F WORD-G WORD-H ';
      let payload = '';
      while (payload.length < cols * 3) payload += seed;
      // Move cursor far down (row 30) so pwsh prompt redraws can't
      // overwrite our test data, then write the long string with no
      // embedded newline so it can ONLY soft-wrap.
      await new Promise<void>((resolve) => {
        term.write('\x1b[30;1H', () => {
          term.write(payload, () => resolve());
        });
      });

      const buf = term.buffer.active;
      const rows: Array<{ y: number; isWrapped: boolean; text: string }> = [];
      for (let y = 0; y < buf.length; y++) {
        const line = buf.getLine(y);
        if (!line) continue;
        const text = line.translateToString(true);
        if (!text.includes('WORD-')) continue;
        rows.push({ y, isWrapped: line.isWrapped, text: text.slice(0, 60) });
      }
      if (rows.length === 0) {
        return { cols, payloadLen: payload.length, rows, selection: null, hasNewline: null, newlineCount: 0, selectionLen: 0, selectionPreview: '' };
      }
      const startY = rows[0].y;
      const endY = rows[rows.length - 1].y;
      term.select(0, startY, term.cols * (endY - startY + 1));
      const selection: string = term.getSelection();
      return {
        cols,
        payloadLen: payload.length,
        rows,
        selectionLen: selection.length,
        selectionPreview: selection.slice(0, 200),
        hasNewline: selection.includes('\n'),
        newlineCount: (selection.match(/\n/g) || []).length,
      };
    });


    console.log('---inspection---');
    console.log('cols:', inspection.cols);
    console.log('payload length:', inspection.payloadLen);
    console.log('rows containing WORD-:');
    for (const r of inspection.rows) {
      console.log(`  y=${r.y} isWrapped=${r.isWrapped} text="${r.text}"`);
    }
    console.log('selectionLen:', (inspection as any).selectionLen);
    console.log('selectionPreview:', (inspection as any).selectionPreview);
    console.log('hasNewline:', inspection.hasNewline);
    console.log('newlineCount:', (inspection as any).newlineCount);

    // Strong assertion: continuation rows MUST have isWrapped=true since
    // we wrote a single long string with no embedded newline.
    expect(inspection.rows.length).toBeGreaterThan(1);
    const continuationRows = inspection.rows.slice(1);
    for (const r of continuationRows) {
      expect(r.isWrapped).toBe(true);
    }

    // The actual question: does the SELECTION contain newlines despite
    // the wrap rows being marked? If this fails, xterm's getSelection
    // is the culprit and we have a bug to fix in tmax/xterm.
    expect(inspection.hasNewline).toBe(false);
  } finally {
    await close();
  }
});
