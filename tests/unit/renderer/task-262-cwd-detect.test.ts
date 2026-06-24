// TASK-262: cwd detection must resolve to the LAST directory in a batched
// PTY chunk, not the first - otherwise the pane (and the File Explorer that
// follows it) latch onto a stale folder after `cd`.
//
// Pure-function tests; do not launch Electron.
import { describe, test, expect } from 'vitest';
import { detectCwdFromChunk } from '../../../src/renderer/utils/cwd-detect';

const BEL = '\x07';

describe('detectCwdFromChunk - prompt regex fallback', () => {
  test('single prompt → that directory', () => {
    expect(detectCwdFromChunk('PS C:\\Users>', false)).toBe('C:\\Users');
  });

  test('batched chunk with several prompts → LAST directory wins (the bug)', () => {
    // A few blank prompts (Enter pressed) then `cd c:\users` then the new
    // prompt, all coalesced into one chunk.
    const chunk = [
      'PS C:\\projects>',
      'PS C:\\projects>',
      'PS C:\\projects> cd c:\\users',
      'PS C:\\Users>',
    ].join('\r\n');
    expect(detectCwdFromChunk(chunk, false)).toBe('C:\\Users');
  });

  test('cmd.exe prompt → directory', () => {
    expect(detectCwdFromChunk('C:\\Windows\\System32>', false)).toBe('C:\\Windows\\System32');
  });

  test('no prompt / no match → null', () => {
    expect(detectCwdFromChunk('just some output\r\nmore output', false)).toBeNull();
  });
});

describe('detectCwdFromChunk - OSC sequences', () => {
  test('OSC 7 file URI (Windows) → backslash path', () => {
    expect(detectCwdFromChunk(`\x1b]7;file:///C:/Users/me${BEL}`, false)).toBe('C:\\Users\\me');
  });

  test('OSC 7 with multiple emissions → last wins', () => {
    const chunk = `\x1b]7;file:///C:/projects${BEL}\x1b]7;file:///C:/Users${BEL}`;
    expect(detectCwdFromChunk(chunk, false)).toBe('C:\\Users');
  });

  test('OSC 7 takes precedence over a trailing prompt', () => {
    const chunk = `\x1b]7;file:///C:/Users${BEL}PS C:\\projects>`;
    expect(detectCwdFromChunk(chunk, false)).toBe('C:\\Users');
  });

  test('OSC 9;9 (ConPTY) → last directory', () => {
    const chunk = `\x1b]9;9;C:\\projects${BEL}\x1b]9;9;C:\\Users${BEL}`;
    expect(detectCwdFromChunk(chunk, false)).toBe('C:\\Users');
  });

  test('OSC 7 WSL path keeps forward slashes', () => {
    expect(detectCwdFromChunk(`\x1b]7;file://wsl/home/me/proj${BEL}`, true)).toBe('/home/me/proj');
  });
});
