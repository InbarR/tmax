import { test, expect } from '@playwright/test';
import { assertNoPathTraversal, isPathWithinRoot } from '../../src/main/utils/security-guards';
import * as path from 'path';

// Regression tests for PR #57 — path traversal guard in git-diff-service.
// The guard was added to readFileContent and getAnnotatedFile to prevent
// directory traversal attacks (e.g. ../../etc/passwd).

test.describe('isPathWithinRoot (PR #57)', () => {
  test('allows root itself', () => {
    const root = path.resolve('/home/user/project');
    expect(isPathWithinRoot(root, root)).toBe(true);
  });

  test('allows descendant path', () => {
    const root = path.resolve('/home/user/project');
    const child = path.resolve('/home/user/project/src/main.ts');
    expect(isPathWithinRoot(root, child)).toBe(true);
  });

  test('rejects parent traversal', () => {
    const root = path.resolve('/home/user/project');
    const escaped = path.resolve('/home/user');
    expect(isPathWithinRoot(root, escaped)).toBe(false);
  });

  test('rejects sibling-prefix path (/home/user-evil vs /home/user)', () => {
    const root = path.resolve('/home/user');
    const sibling = path.resolve('/home/user-evil/payload');
    expect(isPathWithinRoot(root, sibling)).toBe(false);
  });

  test('rejects completely unrelated path', () => {
    const root = path.resolve('/home/user/project');
    const unrelated = path.resolve('/etc/passwd');
    expect(isPathWithinRoot(root, unrelated)).toBe(false);
  });
});

test.describe('assertNoPathTraversal (PR #57)', () => {
  // Use a real directory as root so path.resolve works correctly on Windows
  const root = process.cwd();

  test('allows relative path within root', () => {
    expect(() => assertNoPathTraversal(root, 'src/main.ts')).not.toThrow();
  });

  test('allows nested path', () => {
    expect(() => assertNoPathTraversal(root, 'src/deep/nested/file.ts')).not.toThrow();
  });

  test('throws on ../ escape', () => {
    expect(() => assertNoPathTraversal(root, '../../../etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });

  test('throws on absolute path outside root', () => {
    // On Windows use a different drive, on Unix use /tmp
    const outside = process.platform === 'win32' ? 'D:\\evil\\payload' : '/tmp/evil';
    expect(() => assertNoPathTraversal(root, outside)).toThrow(
      'Path traversal detected',
    );
  });

  test('returns resolved path on success', () => {
    const result = assertNoPathTraversal(root, 'package.json');
    expect(result).toBe(path.resolve(root, 'package.json'));
  });
});
