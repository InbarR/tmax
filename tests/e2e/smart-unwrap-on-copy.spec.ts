// TASK-52: smart unwrap on copy — unit tests for the heuristic.
//
// Pure-function tests; do not launch Electron. Uses Playwright's test
// runner only for assertion sugar (the rest of the suite uses it too).
import { test, expect } from '@playwright/test';
import { smartUnwrapForCopy } from '../../src/renderer/utils/smart-unwrap';

test.describe('smartUnwrapForCopy', () => {
  test('disabled → returns input unchanged', () => {
    const input = 'a\n b\n c';
    expect(smartUnwrapForCopy(input, false)).toBe(input);
  });

  test('single line → returns unchanged', () => {
    expect(smartUnwrapForCopy('hello world')).toBe('hello world');
  });

  test('empty input → returns unchanged', () => {
    expect(smartUnwrapForCopy('')).toBe('');
  });

  test('CLI paragraph with 1-space continuation → joined into one line', () => {
    // Reproduces the user-reported clipboard hex: real \n + " " indent.
    const input = [
      "This isn't specific to my PR — I see the same",
      ' failure on other recent PRs (e.g.',
      ' #415). Looks like the gh api call in that step',
      ' is hitting a 404, and because the response',
      " isn't",
    ].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(
      "This isn't specific to my PR — I see the same failure on other recent PRs (e.g. #415). Looks like the gh api call in that step is hitting a 404, and because the response isn't",
    );
    // No mid-paragraph newlines remain.
    expect(out.split('\n').length).toBe(1);
  });

  test('paragraphs separated by blank line → blank line preserved', () => {
    const input = ['First paragraph line one', ' continues here', '', 'Second paragraph'].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(['First paragraph line one continues here', '', 'Second paragraph'].join('\n'));
  });

  test('fenced code block → leading-space lines NOT joined', () => {
    const input = ['Here is code:', '```', 'function foo() {', '  return 1;', '}', '```', 'After code.'].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(input);
  });

  test('bullet list → bullets not merged into previous line', () => {
    const input = ['Items:', ' - first', ' - second'].join('\n');
    const out = smartUnwrapForCopy(input);
    // Bullets stay on their own lines.
    expect(out).toBe(input);
  });

  test('numbered list → numbers not merged', () => {
    const input = ['Steps:', ' 1. one', ' 2. two'].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(input);
  });

  test('heading → not merged', () => {
    const input = ['Body line', ' # heading', ' continuation'].join('\n');
    const out = smartUnwrapForCopy(input);
    // Heading stays on its own line; continuation joins the heading
    // (which is the desired behaviour — a heading line followed by an
    // indented continuation could only come from a heading wrap).
    expect(out.split('\n')[0]).toBe('Body line');
    expect(out).toContain('# heading');
  });

  test('3+ space indent → treated as code-ish, NOT joined', () => {
    const input = ['Description:', '    indented code line', '    more code'].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(input);
  });

  test('no continuation indent → not joined', () => {
    const input = ['line one', 'line two', 'line three'].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(input);
  });

  test('mixed: fenced code surrounded by paragraphs', () => {
    const input = [
      'Intro line one',
      ' continues here.',
      '',
      '```ts',
      ' const x = 1;',
      ' const y = 2;',
      '```',
      'Outro line',
      ' joins this.',
    ].join('\n');
    const out = smartUnwrapForCopy(input);
    expect(out).toBe(
      [
        'Intro line one continues here.',
        '',
        '```ts',
        ' const x = 1;',
        ' const y = 2;',
        '```',
        'Outro line joins this.',
      ].join('\n'),
    );
  });

  test('AC #4: hex check — no spurious mid-paragraph newlines', () => {
    const input = ['First half of sentence', ' second half.'].join('\n');
    const out = smartUnwrapForCopy(input);
    const newlines = (out.match(/\n/g) || []).length;
    expect(newlines).toBe(0);
  });
});
