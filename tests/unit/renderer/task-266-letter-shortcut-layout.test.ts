// TASK-266: Ctrl+C/V/F must work under non-Latin keyboard layouts.
//
// Pure-function tests for isLetterShortcut. platform.ts reads window/navigator
// at module load, so we stub them before a dynamic import (test env is 'node').
import { describe, test, expect, beforeAll } from 'vitest';

(globalThis as any).window = (globalThis as any).window ?? {};
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = { platform: '' };
}

let isLetterShortcut: (event: { key: string; code: string }, letter: string) => boolean;

beforeAll(async () => {
  ({ isLetterShortcut } = await import('../../../src/renderer/utils/platform'));
});

describe('isLetterShortcut', () => {
  test('Latin layout: event.key matches lowercase', () => {
    expect(isLetterShortcut({ key: 'c', code: 'KeyC' }, 'c')).toBe(true);
  });

  test('Latin layout with Shift: event.key matches uppercase', () => {
    expect(isLetterShortcut({ key: 'C', code: 'KeyC' }, 'c')).toBe(true);
  });

  test('Hebrew layout: physical C reports Hebrew bet in key but KeyC in code', () => {
    // The bug: browser sets event.key to the localized character while the
    // physical position (event.code) stays 'KeyC'. Must still match 'c'.
    expect(isLetterShortcut({ key: 'ב', code: 'KeyC' }, 'c')).toBe(true);
  });

  test('Hebrew layout: physical V matches paste shortcut', () => {
    expect(isLetterShortcut({ key: 'ה', code: 'KeyV' }, 'v')).toBe(true);
  });

  test('Hebrew layout: physical F matches search shortcut', () => {
    expect(isLetterShortcut({ key: 'כ', code: 'KeyF' }, 'f')).toBe(true);
  });

  test('does not match a different physical key', () => {
    expect(isLetterShortcut({ key: 'x', code: 'KeyX' }, 'c')).toBe(false);
  });

  test('empty code falls back to key comparison', () => {
    expect(isLetterShortcut({ key: 'c', code: '' }, 'c')).toBe(true);
    expect(isLetterShortcut({ key: 'ב', code: '' }, 'c')).toBe(false);
  });
});
