// TASK-254: the shared filter grammar gains NOT (exclusion) alongside AND.
import { describe, test, expect } from 'vitest';
import { tokenizeAnd, matchesAllTokens, matchesQuery } from '../../../src/shared/and-filter';

describe('and-filter: AND (existing behavior preserved)', () => {
  test('a bare query is one literal token (spaces kept)', () => {
    expect(tokenizeAnd('foo bar')).toEqual([{ term: 'foo bar', negate: false }]);
  });
  test('AND splits into required tokens, lowercased', () => {
    expect(tokenizeAnd('Foo AND  Bar')).toEqual([
      { term: 'foo', negate: false },
      { term: 'bar', negate: false },
    ]);
  });
  test('empty query yields no tokens (matches everything)', () => {
    expect(tokenizeAnd('   ')).toEqual([]);
    expect(matchesAllTokens('anything', [])).toBe(true);
  });
  test('all AND tokens must be present', () => {
    expect(matchesQuery('the quick brown fox', 'quick AND fox')).toBe(true);
    expect(matchesQuery('the quick brown fox', 'quick AND wolf')).toBe(false);
  });
});

describe('and-filter: NOT (exclusion)', () => {
  test('foo NOT bar requires foo and excludes bar', () => {
    expect(tokenizeAnd('foo NOT bar')).toEqual([
      { term: 'foo', negate: false },
      { term: 'bar', negate: true },
    ]);
    expect(matchesQuery('foo only', 'foo NOT bar')).toBe(true);
    expect(matchesQuery('foo and bar', 'foo NOT bar')).toBe(false);
  });
  test('standalone NOT excludes matches and includes the rest', () => {
    expect(tokenizeAnd('NOT bar')).toEqual([{ term: 'bar', negate: true }]);
    expect(matchesQuery('has bar', 'NOT bar')).toBe(false);
    expect(matchesQuery('clean', 'NOT bar')).toBe(true);
  });
  test('leading - on a clause negates it', () => {
    expect(matchesQuery('foo only', 'foo AND -bar')).toBe(true);
    expect(matchesQuery('foo bar', 'foo AND -bar')).toBe(false);
  });
  test('combined AND + NOT', () => {
    expect(matchesQuery('auth login success', 'auth AND login NOT fail')).toBe(true);
    expect(matchesQuery('auth login fail', 'auth AND login NOT fail')).toBe(false);
  });
  test('exclusion-only query still filters (tokens.length > 0, no short-circuit)', () => {
    expect(tokenizeAnd('NOT x').length).toBe(1);
  });
});

describe('and-filter: dangling / messy operators', () => {
  test('trailing AND / NOT are dropped', () => {
    expect(tokenizeAnd('foo AND')).toEqual([{ term: 'foo', negate: false }]);
    expect(tokenizeAnd('foo NOT')).toEqual([{ term: 'foo', negate: false }]);
  });
  test('hyphenated terms are not treated as negation (only a leading -)', () => {
    expect(tokenizeAnd('task-240')).toEqual([{ term: 'task-240', negate: false }]);
    expect(matchesQuery('see task-240 here', 'task-240')).toBe(true);
  });
});
