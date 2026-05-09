/**
 * Shared AND-token filtering used by every search/filter input in the app.
 *
 * Users can split a query with the literal word `AND` (case-insensitive,
 * whole-word) to require multiple substrings to all match. Empty / whitespace
 * tokens are dropped, so trailing or duplicate `AND`s don't poison the match.
 *
 * Examples:
 *   tokenizeAnd("foo bar")          -> ["foo bar"]
 *   tokenizeAnd("foo AND bar")      -> ["foo", "bar"]
 *   tokenizeAnd("Foo And  bar  AND") -> ["foo", "bar"]
 */
export function tokenizeAnd(query: string): string[] {
  const raw = (query || '').trim();
  if (!raw) return [];
  return raw
    .split(/\bAND\b/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Returns true when every token from `tokens` is found as a substring of
 * `haystack`. Pre-lowercase the haystack at the call site if you care about
 * case-insensitivity (tokens are already lowered by tokenizeAnd).
 *
 * Empty token list matches everything - lets callers drop the early-return
 * for empty queries.
 */
export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  for (const t of tokens) {
    if (!haystack.includes(t)) return false;
  }
  return true;
}

/**
 * Convenience wrapper for callers that don't need to reuse the parsed tokens.
 * For hot paths (filtering 1000s of items) prefer tokenizing once outside the
 * loop and calling matchesAllTokens directly.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  return matchesAllTokens(haystack.toLowerCase(), tokenizeAnd(query));
}
