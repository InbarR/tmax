// TASK-52: Smart unwrap on copy.
//
// Copilot CLI / Claude Code render long paragraphs into the terminal by
// emitting hard newlines plus a single leading space on continuation rows.
// Confirmed via `Get-Clipboard | Format-Hex` from both tmax AND Windows
// Terminal — the hard newlines and the indent are in the source bytes,
// not a tmax copy bug. Pasting that text into a chat window (or this very
// CLI) produces a broken paragraph with mid-sentence newlines.
//
// At copy time we can stitch those continuation rows back into a single
// line. Same heuristic family as TASK-46 (URL stitch across hard newlines
// with indented continuation), but applied to whole paragraphs.
//
// Heuristic (intentionally conservative — false positives are worse than
// false negatives):
//
//   • A row that begins with EXACTLY 1 or 2 leading spaces followed by
//     non-whitespace text is treated as a continuation of the previous
//     row, and joined with a single space.
//
//   • Skipped (kept as-is):
//       - rows inside fenced code blocks (```)
//       - rows starting with a bullet/number marker
//         (`-`, `*`, `+`, `1.`, `2)` …) even if indented
//       - rows starting with a heading marker (`#`, `>`)
//       - rows with 3+ leading spaces (looks like code indentation)
//       - rows where the previous row ended with a code-fence marker
//
//   • Empty lines always reset paragraph state.
//
// Toggle: `terminal.smartUnwrapCopy` (default true). When false, returns
// the input unchanged.

const BULLET_RE = /^\s*([-*+]|\d+[.)])\s/;
const HEADING_RE = /^\s*(#{1,6}|>)\s/;
const CODE_FENCE_RE = /^\s*```/;

/**
 * Stitch CLI-rendered hard newlines back into paragraphs.
 *
 * @param text Selection from xterm (already LF-normalised).
 * @param enabled When false, returns text unchanged.
 */
export function smartUnwrapForCopy(text: string, enabled: boolean = true): string {
  if (!enabled) return text;
  if (!text || !text.includes('\n')) return text;

  const lines = text.split('\n');
  const out: string[] = [];
  let inFence = false;

  // Strip horizontal trailing whitespace (including any stray CR from
  // CRLF-terminated rows that survived the LF split) before emitting. Rows
  // inside a fenced code block are kept verbatim - trailing spaces can
  // matter inside code (e.g. markdown line-break, intentional padding).
  // Outside code, xterm's selection / buffer-snapshot can carry row-pad
  // trailing spaces that look fine in the terminal but cause visible
  // mid-line gaps when pasted into a wrap-on-display editor (TASK-125).
  const trimRowEnd = (row: string): string =>
    inFence ? row : row.replace(/[ \t\r]+$/u, '');

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];

    if (CODE_FENCE_RE.test(cur)) {
      inFence = !inFence;
      out.push(cur);
      continue;
    }
    if (inFence) {
      out.push(cur);
      continue;
    }
    if (cur.trim() === '') {
      out.push(cur);
      continue;
    }

    // Continuation candidate: 1-2 leading spaces + non-whitespace,
    // not a bullet/heading.
    const m = /^( {1,2})\S/.exec(cur);
    const isContinuation =
      !!m &&
      !BULLET_RE.test(cur) &&
      !HEADING_RE.test(cur);

    if (isContinuation && out.length > 0) {
      const prev = out[out.length - 1];
      const prevTrimmed = prev.trim();
      // Don't merge into empty/blank previous, bullets-only, or code fences.
      if (
        prevTrimmed !== '' &&
        !CODE_FENCE_RE.test(prev)
      ) {
        out[out.length - 1] = trimRowEnd(prev.trimEnd() + ' ' + cur.trimStart());
        continue;
      }
    }

    out.push(trimRowEnd(cur));
  }

  return out.join('\n');
}
