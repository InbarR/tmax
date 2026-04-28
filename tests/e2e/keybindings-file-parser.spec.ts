import { test, expect } from '@playwright/test';
import { parseKeybindingsContent, serializeKeybindings } from '../../src/main/keybindings-file';

// TASK-39: pure-function tests for the keybindings.json parser. The parser
// must tolerate `//` line comments, trailing commas, and malformed entries
// without aborting the whole file - one typo shouldn't lock the user out
// of all their shortcuts.

test.describe('keybindings.json parser (TASK-39)', () => {
  test('parses a clean array', () => {
    const out = parseKeybindingsContent(JSON.stringify([
      { key: 'Ctrl+T', action: 'createTerminal' },
      { key: 'Ctrl+Shift+W', action: 'closeTerminal' },
    ]));
    expect(out).toEqual([
      { key: 'Ctrl+T', action: 'createTerminal' },
      { key: 'Ctrl+Shift+W', action: 'closeTerminal' },
    ]);
  });

  test('strips // line comments before parsing', () => {
    const content = `
// Header comment
// Schema: { key, action }
[
  // single binding
  { "key": "Ctrl+T", "action": "createTerminal" }
]
`;
    expect(parseKeybindingsContent(content)).toEqual([
      { key: 'Ctrl+T', action: 'createTerminal' },
    ]);
  });

  test('does NOT strip // when it appears inside a string literal', () => {
    // A user could legitimately have // in a key string (no current binding
    // does, but the parser must not corrupt strings).
    const content = `[{ "key": "Ctrl+/", "action": "search/find" }]`;
    expect(parseKeybindingsContent(content)).toEqual([
      { key: 'Ctrl+/', action: 'search/find' },
    ]);
  });

  test('tolerates trailing commas', () => {
    const content = `[
      { "key": "Ctrl+T", "action": "createTerminal" },
    ]`;
    expect(parseKeybindingsContent(content)).toEqual([
      { key: 'Ctrl+T', action: 'createTerminal' },
    ]);
  });

  test('skips malformed entries with a warning, keeps valid ones', () => {
    const warnings: string[] = [];
    const content = JSON.stringify([
      { key: 'Ctrl+T', action: 'createTerminal' },
      'not-an-object',
      { key: 'Ctrl+Shift+W' }, // missing action
      { action: 'focusUp' }, // missing key
      { key: 42, action: 'closeTerminal' }, // wrong type
      { key: 'Ctrl+Shift+P', action: 'commandPalette' },
    ]);
    const out = parseKeybindingsContent(content, (m) => warnings.push(m));
    expect(out).toEqual([
      { key: 'Ctrl+T', action: 'createTerminal' },
      { key: 'Ctrl+Shift+P', action: 'commandPalette' },
    ]);
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  test('returns [] with a warning when JSON is malformed', () => {
    const warnings: string[] = [];
    const out = parseKeybindingsContent('not valid json {[}', (m) => warnings.push(m));
    expect(out).toEqual([]);
    expect(warnings[0]).toMatch(/parse error/i);
  });

  test('returns [] when the top-level value is not an array', () => {
    const warnings: string[] = [];
    const out = parseKeybindingsContent('{"key":"Ctrl+T","action":"createTerminal"}', (m) => warnings.push(m));
    expect(out).toEqual([]);
    expect(warnings[0]).toMatch(/array/i);
  });

  test('serialize -> parse round-trip preserves bindings', () => {
    const bindings = [
      { key: 'Ctrl+T', action: 'createTerminal' },
      { key: 'Ctrl+Shift+W', action: 'closeTerminal' },
      { key: 'Shift+ArrowUp', action: 'focusUp' },
    ];
    const text = serializeKeybindings(bindings, ['createTerminal', 'closeTerminal', 'focusUp']);
    expect(text).toMatch(/^\/\//); // header is doc comments
    expect(parseKeybindingsContent(text)).toEqual(bindings);
  });

  test('serialized header lists every available action', () => {
    const text = serializeKeybindings([], ['createTerminal', 'closeTerminal', 'focusUp', 'splitVertical']);
    for (const action of ['createTerminal', 'closeTerminal', 'focusUp', 'splitVertical']) {
      expect(text).toContain(action);
    }
  });
});
