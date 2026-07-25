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

// TASK-277 / GH #143: TUI apps (Copilot CLI, Claude Code, Ink-based CLIs)
// render panel borders using box-drawing vertical characters (│ U+2502,
// ┃ U+2503, ║ U+2551). These bleed into copies and appear as stray "|"
// when pasted outside the terminal.
const BOX_VERT_CHARS = '\u2502\u2503\u2551'; // │ ┃ ║
const BOX_VERT_START_RE = /^[│┃║]/u;
const BOX_VERT_END_RE = /[│┃║]\s*$/u;
// A line composed entirely of box-drawing characters (U+2500-U+257F) and
// whitespace — the top/bottom border of a TUI panel.
const FULL_BORDER_LINE_RE = /^[\u2500-\u257F\s]+$/u;

/**
 * Detect and strip TUI box-drawing borders from an array of lines (mutates).
 *
 * Heuristic: if more than half of the non-empty, non-border content lines
 * have box-drawing vertical characters at the left edge, strip left borders.
 * Independently, if >50% have them at the right edge, strip right borders.
 *
 * Also handles ASCII `|` as a border when every qualifying line starts and
 * ends with `|` and has no mid-content `|` (distinguishes from markdown
 * tables which have interior `|` delimiters).
 */
function stripTuiBorders(lines: string[]): void {
  let boxLeft = 0;
  let boxRight = 0;
  let pipeLeft = 0;
  let pipeRight = 0;
  let contentLines = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t || FULL_BORDER_LINE_RE.test(t)) continue;
    contentLines++;
    if (BOX_VERT_START_RE.test(line)) boxLeft++;
    if (BOX_VERT_END_RE.test(line)) boxRight++;
    // ASCII pipe: only count as border if no mid-content pipes
    if (t.startsWith('|')) {
      const inner = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
      if (!inner.includes('|')) pipeLeft++;
    }
    if (t.endsWith('|')) {
      const inner = t.startsWith('|') ? t.slice(1, -1) : t.slice(0, -1);
      if (!inner.includes('|')) pipeRight++;
    }
  }

  if (contentLines === 0) return;

  const stripBoxLeft = boxLeft / contentLines > 0.5;
  const stripBoxRight = boxRight / contentLines > 0.5;
  const stripPipeLeft = !stripBoxLeft && pipeLeft / contentLines > 0.5;
  const stripPipeRight = !stripBoxRight && pipeRight / contentLines > 0.5;

  if (!stripBoxLeft && !stripBoxRight && !stripPipeLeft && !stripPipeRight) return;

  for (let i = 0; i < lines.length; i++) {
    // Remove lines that are entirely box-drawing (top/bottom borders)
    if (FULL_BORDER_LINE_RE.test(lines[i].trim())) {
      lines[i] = '';
      continue;
    }
    if (stripBoxLeft) {
      lines[i] = lines[i].replace(/^[│┃║]\s?/u, '');
    }
    if (stripBoxRight) {
      lines[i] = lines[i].replace(/\s*[│┃║]$/u, '');
    }
    if (stripPipeLeft) {
      lines[i] = lines[i].replace(/^\|\s?/, '');
    }
    if (stripPipeRight) {
      lines[i] = lines[i].replace(/\s*\|$/, '');
    }
  }
}

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

  // Strip TUI box-drawing borders before the main continuation-join pass
  // so the heuristic sees clean content lines (TASK-277 / GH #143).
  stripTuiBorders(lines);

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
      // Only merge into a previous line that starts at column 0. Wrap
      // continuations only happen against an unindented paragraph - if
      // BOTH lines are indented, they're parallel content (e.g. Claude/
      // Copilot rendering a chat message with a 2-space container indent
      // around every line of a code block). The earlier check ran solely
      // on the prev line's content/whitespace state, so a 10-line code
      // block all sharing the same "  " prefix collapsed into one giant
      // line on copy (TASK-174 follow-up).
      const prevIsUnindented = /^\S/.test(prev);
      // Don't merge into empty/blank previous, bullets-only, or code fences.
      if (
        prevTrimmed !== '' &&
        prevIsUnindented &&
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
