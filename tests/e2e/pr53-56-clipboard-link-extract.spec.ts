import { test, expect } from '@playwright/test';
// TASK-61 consolidated link-extract.ts into paste.ts and replaced the
// looser extractLinkFromHtml with the stricter extractStandaloneLinkFromHtml,
// which adds a "visible text equals link inner text or href" check so prose
// containing a link doesn't get rewritten into the link. The PR-53/56 cases
// in this file all pass the stricter check (single-link wrappers with no
// surrounding prose), so the assertions still hold under the new function.
import { extractStandaloneLinkFromHtml as extractLinkFromHtml, unwrapSafelinks } from '../../src/renderer/utils/paste';

// Regression tests for PR #53 (clipboard paste HTML links) and
// PR #56 (validate URL protocol in clipboard paste).

test.describe('unwrapSafelinks (PR #53)', () => {
  test('unwraps Outlook safelinks to the real URL', () => {
    const safelink =
      'https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fgithub.com%2FInbarR%2Ftmax&data=xyz';
    expect(unwrapSafelinks(safelink)).toBe('https://github.com/InbarR/tmax');
  });

  test('returns original URL when not a safelink', () => {
    expect(unwrapSafelinks('https://github.com/InbarR/tmax')).toBe(
      'https://github.com/InbarR/tmax',
    );
  });

  test('returns original URL when safelink has no url param', () => {
    const broken = 'https://nam06.safelinks.protection.outlook.com/?data=xyz';
    expect(unwrapSafelinks(broken)).toBe(broken);
  });

  test('rejects safelink wrapping a non-http URL', () => {
    const ftp =
      'https://nam06.safelinks.protection.outlook.com/?url=ftp%3A%2F%2Fevil.com&data=x';
    expect(unwrapSafelinks(ftp)).toBe(ftp);
  });

  test('handles invalid URL gracefully', () => {
    expect(unwrapSafelinks('not a url at all')).toBe('not a url at all');
  });
});

test.describe('extractLinkFromHtml (PR #53 / #56)', () => {
  test('extracts single http link from HTML', () => {
    const html = '<a href="https://github.com/InbarR/tmax/pull/80">PR #80</a>';
    expect(extractLinkFromHtml(html)).toBe('https://github.com/InbarR/tmax/pull/80');
  });

  test('extracts single https link with extra attributes', () => {
    const html = '<a class="link" href="https://example.com/page" target="_blank">link</a>';
    expect(extractLinkFromHtml(html)).toBe('https://example.com/page');
  });

  test('returns null for multiple links (PR #56 — ambiguous)', () => {
    const html =
      '<a href="https://example.com/a">A</a> and <a href="https://example.com/b">B</a>';
    expect(extractLinkFromHtml(html)).toBeNull();
  });

  test('returns null for non-http protocol (PR #56 — protocol validation)', () => {
    const html = '<a href="ftp://evil.com/payload">click</a>';
    expect(extractLinkFromHtml(html)).toBeNull();
  });

  test('returns null for javascript: protocol (PR #56 — XSS prevention)', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    expect(extractLinkFromHtml(html)).toBeNull();
  });

  test('returns null for file: protocol', () => {
    const html = '<a href="file:///etc/passwd">file</a>';
    expect(extractLinkFromHtml(html)).toBeNull();
  });

  test('returns null for empty/falsy input', () => {
    expect(extractLinkFromHtml('')).toBeNull();
    expect(extractLinkFromHtml(null as any)).toBeNull();
    expect(extractLinkFromHtml(undefined as any)).toBeNull();
  });

  test('returns null when HTML has no links', () => {
    expect(extractLinkFromHtml('<p>just some text</p>')).toBeNull();
  });

  test('unwraps safelinks inside HTML', () => {
    const html =
      '<a href="https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fdev.azure.com%2Fmsazure&data=x">ADO</a>';
    expect(extractLinkFromHtml(html)).toBe('https://dev.azure.com/msazure');
  });

  test('handles ADO "Copy to clipboard" HTML format', () => {
    // ADO typically produces: <a href="url">PR Title</a>
    const html =
      '<a href="https://dev.azure.com/msazure/One/_git/Sec4AI-NormalizationService/pullrequest/123">fix: add retry logic</a>';
    expect(extractLinkFromHtml(html)).toBe(
      'https://dev.azure.com/msazure/One/_git/Sec4AI-NormalizationService/pullrequest/123',
    );
  });

  test('case-insensitive protocol check', () => {
    const html = '<a href="HTTP://example.com">link</a>';
    expect(extractLinkFromHtml(html)).toBe('HTTP://example.com');
  });
});
