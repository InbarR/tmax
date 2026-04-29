import { test, expect } from '@playwright/test';
import { isDangerousExtension, DANGEROUS_OPEN_EXTENSIONS } from '../../src/main/utils/security-guards';

// Regression tests for PR #58 — restrict shell.openPath to block
// dangerous executable extensions.

test.describe('isDangerousExtension (PR #58)', () => {
  const dangerous = [
    '.exe', '.bat', '.cmd', '.ps1', '.msi', '.com', '.scr', '.pif',
    '.lnk', '.hta', '.vbs', '.vbe', '.jse', '.wsf', '.wsh',
    '.reg', '.msc', '.cpl', '.chm',
    '.sh', '.app', '.command',
    '.jar', '.py', '.pyw',
  ];

  for (const ext of dangerous) {
    test(`blocks ${ext}`, () => {
      expect(isDangerousExtension(`C:\\Users\\test\\file${ext}`)).toBe(true);
    });
  }

  test('blocks uppercase extensions', () => {
    expect(isDangerousExtension('C:\\test\\malware.EXE')).toBe(true);
    expect(isDangerousExtension('C:\\test\\script.PS1')).toBe(true);
  });

  test('blocks mixed-case extensions', () => {
    expect(isDangerousExtension('C:\\test\\run.Bat')).toBe(true);
  });

  const safe = ['.txt', '.md', '.json', '.pdf', '.png', '.jpg', '.html', '.css', '.ts', '.js', '.log'];
  for (const ext of safe) {
    test(`allows ${ext}`, () => {
      expect(isDangerousExtension(`/home/user/file${ext}`)).toBe(false);
    });
  }

  test('allows directories (no extension)', () => {
    expect(isDangerousExtension('C:\\Users\\test\\folder')).toBe(false);
  });

  test('returns false for empty/invalid input', () => {
    expect(isDangerousExtension('')).toBe(false);
    expect(isDangerousExtension(null as any)).toBe(false);
    expect(isDangerousExtension(undefined as any)).toBe(false);
  });

  test('blocklist is complete (snapshot guard)', () => {
    // If someone accidentally removes an extension from the set,
    // this test will catch it.
    expect(DANGEROUS_OPEN_EXTENSIONS.size).toBe(25);
  });
});
