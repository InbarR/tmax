/**
 * Shared token filtering used by every search/filter input in the app.
 *
 * Grammar (all keywords case-insensitive, whole-word):
 *   - `AND` separates required substrings - all must match.
 *       `foo AND bar`  -> haystack must contain "foo" AND "bar"
 *   - `NOT` (or a leading `-` on a token) negates the following clause - the
 *     substring must be ABSENT.
 *       `foo NOT bar`  -> contains "foo" but NOT "bar"
 *       `NOT bar`      -> excludes anything containing "bar"
 *       `foo AND -bar` -> contains "foo" but NOT "bar"
 *
 * Spaces inside a clause are literal (`foo bar` is the single substring
 * "foo bar"). Empty / dangling operators are dropped so a trailing `AND` /
 * `NOT` doesn't poison the match.
 *
 * Examples:
 *   tokenizeAnd("foo bar")        -> [{term:"foo bar", negate:false}]
 *   tokenizeAnd("foo AND bar")    -> [{term:"foo"}, {term:"bar"}]
 *   tokenizeAnd("foo NOT bar")    -> [{term:"foo"}, {term:"bar", negate:true}]
 */
export interface QueryToken {
  /** substring to test (already lowercased) */
  term: string;
  /** when true the substring must be ABSENT for a match */
  negate: boolean;
}

export function tokenizeAnd(query: string): QueryToken[] {
  const raw = (query || '').trim();
  if (!raw) return [];
  // Split on AND / NOT word boundaries, keeping the delimiters so we know which
  // clauses are negated. A NOT delimiter negates the clause that follows it.
  const parts = raw.split(/\b(AND|NOT)\b/i);
  const out: QueryToken[] = [];
  let negateNext = false;
  for (const part of parts) {
    const kw = part.trim().toUpperCase();
    if (kw === 'AND') { negateNext = false; continue; }
    if (kw === 'NOT') { negateNext = true; continue; }
    let t = part.trim();
    if (!t) continue; // empty segment (e.g. between two operators) - keep flag
    let negate = negateNext;
    negateNext = false;
    // A leading `-` also negates that single clause (`-bar`).
    if (/^-\S/.test(t)) { negate = true; t = t.slice(1).trim(); }
    if (!t) continue;
    out.push({ term: t.toLowerCase(), negate });
  }
  return out;
}

/**
 * Returns true when every include token is a substring of `haystack` and every
 * negated (NOT) token is absent. Pre-lowercase the haystack at the call site
 * (tokens are already lowered by tokenizeAnd).
 *
 * Empty token list matches everything - lets callers drop the early-return for
 * empty queries.
 */
export function matchesAllTokens(haystack: string, tokens: QueryToken[]): boolean {
  if (tokens.length === 0) return true;
  for (const { term, negate } of tokens) {
    const present = haystack.includes(term);
    if (negate ? present : !present) return false;
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
