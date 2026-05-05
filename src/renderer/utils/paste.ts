// Normalize CRLF/CR to LF so readline-style shells (PSReadLine, bash readline,
// Claude Code, Copilot CLI) don't submit twice on a single embedded newline.
// When the focused shell has advertised bracketed paste (?2004h), wrap the
// payload in CSI 200~ / 201~ so embedded newlines are treated as data rather
// than Enter.
export function prepareClipboardPaste(text: string, bracketedPaste: boolean): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return bracketedPaste ? `\x1b[200~${normalized}\x1b[201~` : normalized;
}

/**
 * Decode Outlook safelinks-wrapped URLs back to the real target. ATP rewrites
 * external links as `https://*.safelinks.protection.outlook.com/?url=<encoded>`
 * for click protection, which means the visible URL the user sees is not the
 * real target. If we detect the wrapper, decode and return the real URL.
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
 * Strip HTML tags, comments, and decode the most common entities to produce
 * normalized visible text. Used by the standalone-link detector to compare
 * the document's overall visible text against an embedded link's inner text.
 */
function stripHtmlVisibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a "standalone link" URL from HTML clipboard content. Standalone
 * means the HTML is essentially just an `<a>` wrapper - the document's
 * visible text equals the link's inner text. Catches:
 *   - ADO "Copy to clipboard" for PR titles: `<a href=URL>title</a>`
 *   - Outlook safelinks-wrapped URLs: `<a href=safelink>visible-url</a>`
 *
 * Deliberately does NOT fire for rich text with prose around a link
 * (Teams chat, web articles), which falls through to plain text - the
 * earlier `matches.length === 1` heuristic over-fired in that case
 * (TASK-61).
 *
 * Returns the (safelinks-unwrapped) href, or null.
 */
export function extractStandaloneLinkFromHtml(html: string): string | null {
  if (!html) return null;
  const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches: { href: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(html)) !== null) {
    matches.push({ href: m[1], inner: m[2] });
  }
  if (matches.length !== 1) return null;
  const { href, inner } = matches[0];
  if (!/^https?:\/\//i.test(href)) return null;

  const visibleText = stripHtmlVisibleText(html);
  const linkInner = stripHtmlVisibleText(inner);

  // Case A: HTML is exactly the link (no surrounding prose).
  // ADO PR title "Copy to clipboard", Outlook safelinks-as-bare-URL.
  if (visibleText === linkInner || visibleText === href) {
    return unwrapSafelinks(href);
  }

  // Case B: link is at the start of the visible text and the trailing prose
  // begins with a separator (`:`, `-`, `|`, `(`, etc.) - the "label : description"
  // pattern emitted by ADO / IcM / GitHub copy buttons (e.g. `<a>Incident 12345</a>
  // : Service is down`). Trailing description has no clickable URL, so users
  // expect the URL to be pasted. Differs from prose-with-embedded-link
  // ("Click here for details") because that has a continuation word, not a
  // separator, after the link.
  if (linkInner && visibleText.startsWith(linkInner)) {
    const tail = visibleText.slice(linkInner.length);
    if (tail === '' || /^\s*[:\-–—|()/.,;]/.test(tail)) {
      return unwrapSafelinks(href);
    }
  }

  return null;
}

export type ClipboardPasteDecision =
  | { kind: 'image' }
  | { kind: 'text'; text: string }
  | { kind: 'none' };

/**
 * Decide what to paste given (image-on-clipboard, html, plain-text).
 *
 * Precedence:
 *   1. Image with no plain text -> kind: 'image' (caller saves PNG, pastes path).
 *   2. HTML is a standalone link wrapper -> kind: 'text', the unwrapped URL.
 *   3. Plain text exists -> kind: 'text', the plain text (with safelinks
 *      unwrap when the entire text is a bare https URL).
 *   4. Nothing useful -> kind: 'none'.
 *
 * Pre-fix this logic preferred image whenever ANY image format was on the
 * clipboard (even with text alongside, e.g. Teams emoji-in-prose) and
 * preferred a single-link extracted URL whenever HTML had exactly one
 * link (overwriting prose around the link). Both heuristics over-fired
 * for rich-text Teams/web copies (TASK-61).
 */
export function resolveClipboardPaste(input: { hasImage: boolean; html: string; plainText: string }): ClipboardPasteDecision {
  const { hasImage, html, plainText } = input;
  if (hasImage && !plainText) return { kind: 'image' };

  const linkUrl = extractStandaloneLinkFromHtml(html);
  if (linkUrl) return { kind: 'text', text: linkUrl };

  if (plainText) {
    const trimmed = plainText.trim();
    if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
      return { kind: 'text', text: unwrapSafelinks(trimmed) };
    }
    return { kind: 'text', text: plainText };
  }

  return { kind: 'none' };
}
