import { test, expect } from '@playwright/test';
import { isValidWslDistro } from '../../src/main/utils/security-guards';

// Regression tests for PR #60 — confine FILE_READ/FILE_LIST by validating
// WSL distro names. Invalid distro names could be used to escape the
// intended path translation.

test.describe('isValidWslDistro (PR #60)', () => {
  test('accepts standard distro names', () => {
    expect(isValidWslDistro('Ubuntu')).toBe(true);
    expect(isValidWslDistro('Ubuntu-22.04')).toBe(true);
    expect(isValidWslDistro('Debian')).toBe(true);
    expect(isValidWslDistro('kali-linux')).toBe(true);
    expect(isValidWslDistro('openSUSE-Leap-15.4')).toBe(true);
  });

  test('accepts single character', () => {
    expect(isValidWslDistro('U')).toBe(true);
  });

  test('accepts names with dots and hyphens', () => {
    expect(isValidWslDistro('my.distro-v2')).toBe(true);
  });

  test('rejects empty string', () => {
    expect(isValidWslDistro('')).toBe(false);
  });

  test('rejects path traversal attempts', () => {
    expect(isValidWslDistro('../../../etc')).toBe(false);
    expect(isValidWslDistro('..\\windows\\system32')).toBe(false);
    expect(isValidWslDistro('Ubuntu/../../etc')).toBe(false);
  });

  test('rejects spaces', () => {
    expect(isValidWslDistro('Ubuntu 22.04')).toBe(false);
  });

  test('rejects special characters', () => {
    expect(isValidWslDistro('distro;rm -rf /')).toBe(false);
    expect(isValidWslDistro('distro$(whoami)')).toBe(false);
    expect(isValidWslDistro('distro`id`')).toBe(false);
  });

  test('rejects names starting with dot or hyphen', () => {
    expect(isValidWslDistro('.hidden')).toBe(false);
    expect(isValidWslDistro('-flag')).toBe(false);
  });

  test('rejects UNC path injections', () => {
    expect(isValidWslDistro('\\\\evil.com\\share')).toBe(false);
    expect(isValidWslDistro('//evil.com/share')).toBe(false);
  });
});
