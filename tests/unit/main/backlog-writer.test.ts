import { describe, expect, test } from 'vitest';
import { bareId } from '../../../src/main/backlog-writer';

describe('bareId', () => {
  test('strips upper- and lower-case task prefixes', () => {
    expect(bareId('TASK-123')).toBe('123');
    expect(bareId('task-456')).toBe('456');
  });

  test('extracts ids from task filenames and plain strings', () => {
    expect(bareId('task-42 - add-tests.md')).toBe('42');
    expect(bareId('789')).toBe('789');
  });

  test('falls back to the input string when no numeric id exists', () => {
    expect(bareId('draft')).toBe('draft');
  });
});
