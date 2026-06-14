// TASK-180: prompt composer — pure-function tests for the draft map helpers
// and the bracketed-paste payload Submit emits.
//
// Pure tests; Electron is not launched. Mirrors the style of
// smart-unwrap-on-copy.spec.ts and paste-wrap.spec.ts.

import { test, expect } from '@playwright/test';
import {
  dropComposerDraft,
  updateComposerDrafts,
} from '../../src/renderer/utils/prompt-composer';
import { prepareClipboardPaste } from '../../src/renderer/utils/paste';

test.describe('updateComposerDrafts', () => {
  test('non-empty draft stores text under terminalId', () => {
    const out = updateComposerDrafts({}, 't1', 'hello');
    expect(out).toEqual({ t1: 'hello' });
  });

  test('non-empty draft overwrites existing entry for same terminalId', () => {
    const out = updateComposerDrafts({ t1: 'old' }, 't1', 'new');
    expect(out).toEqual({ t1: 'new' });
  });

  test('non-empty draft preserves other terminals untouched', () => {
    const out = updateComposerDrafts({ t1: 'one', t2: 'two' }, 't1', 'NEW');
    expect(out).toEqual({ t1: 'NEW', t2: 'two' });
  });

  test('empty draft removes the terminalId key so the map does not accumulate empties', () => {
    const out = updateComposerDrafts({ t1: 'hello', t2: 'world' }, 't1', '');
    expect(out).toEqual({ t2: 'world' });
    expect('t1' in out).toBe(false);
  });

  test('empty draft on missing terminalId is a no-op', () => {
    const out = updateComposerDrafts({ t2: 'world' }, 't1', '');
    expect(out).toEqual({ t2: 'world' });
  });

  test('does not mutate the input object', () => {
    const input = { t1: 'hello' };
    updateComposerDrafts(input, 't2', 'world');
    expect(input).toEqual({ t1: 'hello' });
  });

  test('multi-line drafts (with newlines) are stored verbatim', () => {
    const draft = 'line 1\nline 2\n\nline 4';
    const out = updateComposerDrafts({}, 't1', draft);
    expect(out.t1).toBe(draft);
  });
});

test.describe('dropComposerDraft', () => {
  test('removes the entry for an existing terminalId', () => {
    const out = dropComposerDraft({ t1: 'hello', t2: 'world' }, 't1');
    expect(out).toEqual({ t2: 'world' });
  });

  test('returns the SAME reference when the terminalId is not present', () => {
    // Reference equality matters: it lets the store skip a needless
    // re-render when an unrelated terminal is closed.
    const input = { t1: 'hello' };
    const out = dropComposerDraft(input, 't2');
    expect(out).toBe(input);
  });

  test('does not mutate the input object', () => {
    const input = { t1: 'hello', t2: 'world' };
    dropComposerDraft(input, 't1');
    expect(input).toEqual({ t1: 'hello', t2: 'world' });
  });

  test('clearing the last entry yields an empty object, not undefined', () => {
    const out = dropComposerDraft({ t1: 'only' }, 't1');
    expect(out).toEqual({});
  });
});

test.describe('Submit payload (bracketed paste + CRLF normalization)', () => {
  // The composer's Submit handler delegates to prepareClipboardPaste with
  // bracketedPaste=true. These tests pin that contract from the composer's
  // perspective so a future refactor that drops the helper doesn't silently
  // change Submit behavior.

  test('single-line draft is wrapped in CSI 200~ / 201~', () => {
    expect(prepareClipboardPaste('hello world', true)).toBe('\x1b[200~hello world\x1b[201~');
  });

  test('multi-line draft preserves newlines inside the bracketed paste', () => {
    const draft = 'first\nsecond\nthird';
    expect(prepareClipboardPaste(draft, true)).toBe('\x1b[200~first\nsecond\nthird\x1b[201~');
  });

  test('CRLF in a draft (e.g. pasted Windows clipboard) is normalized to LF', () => {
    expect(prepareClipboardPaste('a\r\nb', true)).toBe('\x1b[200~a\nb\x1b[201~');
  });
});
