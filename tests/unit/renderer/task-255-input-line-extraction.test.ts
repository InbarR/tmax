// TASK-255: opening the Prompt Editor on a busy AI CLI pane seeded the editor
// with the agent's streaming output instead of the user's input line. The
// walk-up that reconstructs the input climbed above the inline `>` input box
// into the output, because Ink CLIs render the box directly below output with
// no blank separator. Fix: stop the walk-up when the current row is itself an
// inline prompt line, so extraction never rises above the input box.
import { describe, test, expect } from 'vitest';
import { extractInputLineFromBuffer } from '../../../src/renderer/terminal-registry';

type Row = { text: string; wrapped?: boolean };

// Minimal xterm-buffer mock: cursor sits on `cursorRow` (0-based absolute).
function mkBuf(rows: Row[], cursorRow: number) {
  return {
    baseY: 0,
    cursorY: cursorRow,
    length: rows.length,
    getLine(r: number) {
      const row = rows[r];
      if (!row) return undefined;
      return { isWrapped: !!row.wrapped, translateToString: () => row.text };
    },
  };
}

describe('TASK-255: input-line extraction stops at the inline prompt', () => {
  test('AI CLI pane mid-response: captures the input line, not the agent output above it', () => {
    const buf = mkBuf(
      [
        { text: '● Let me verify the dev server' },
        { text: '● Running 1 shell command' },
        { text: '  $ try {' },
        { text: '> fix the workspace blank-pane bug' }, // input line (cursor here)
      ],
      3,
    );
    expect(extractInputLineFromBuffer(buf)).toBe('fix the workspace blank-pane bug');
  });

  test('empty input box while the agent is thinking seeds nothing', () => {
    const buf = mkBuf(
      [
        { text: '● Considering... thinking some more' },
        { text: '> ' }, // empty input box (cursor here)
      ],
      1,
    );
    expect(extractInputLineFromBuffer(buf)).toBe('');
  });

  test('shell prompt: still strips the prompt and returns the typed command', () => {
    const buf = mkBuf(
      [
        { text: 'some previous command output' },
        { text: 'PS C:\\projects\\tmax> git status' },
      ],
      1,
    );
    expect(extractInputLineFromBuffer(buf)).toBe('git status');
  });

  test('soft-wrapped inline input is joined across rows', () => {
    const buf = mkBuf(
      [
        { text: '> this is a really long prompt that ' },
        { text: 'wrapped onto a second row', wrapped: true }, // cursor here
      ],
      1,
    );
    expect(extractInputLineFromBuffer(buf)).toBe('this is a really long prompt that wrapped onto a second row');
  });

  test('shell prompt with a blank line above (regression) is unaffected', () => {
    const buf = mkBuf(
      [{ text: 'output' }, { text: '' }, { text: 'PS C:\\> ls' }],
      2,
    );
    expect(extractInputLineFromBuffer(buf)).toBe('ls');
  });
});
