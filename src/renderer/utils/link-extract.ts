/**
 * Outlook safelinks unwrapper + HTML link extractor.
 * Extracted from TerminalPanel.tsx and DetachedApp.tsx so the logic can be
 * shared and regression-tested without launching Electron.
 */

/**
 * Microsoft Outlook wraps every outgoing link in
 * https://<region>.safelinks.protection.outlook.com/?url=<encoded-real-url>&...
 * If we detect the wrapper, decode and return the real URL.
 */
export function unwrapSafelinks(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)safelinks\.protection\.outlook\.com$/i.test(u.hostname)) {
      const real = u.searchParams.get('url');
      if (real && /^https?:\/\//i.test(real)) return real;
    }
  } catch { /* not a valid URL */ }
  return url;
}

/**
 * Extract a URL from HTML clipboard content when the content is essentially
 * a single hyperlink (e.g. ADO "Copy to clipboard" for PR titles, Outlook
 * safelinks-wrapped URLs).
 * Returns the href if found, null otherwise.
 */
export function extractLinkFromHtml(html: string): string | null {
  if (!html) return null;
  const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(html)) !== null) {
    matches.push(m[1]);
  }
  if (matches.length === 1 && /^https?:\/\//i.test(matches[0])) {
    return unwrapSafelinks(matches[0]);
  }
  return null;
}
