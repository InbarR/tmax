/**
 * Global registry for xterm Terminal instances and their SearchAddons.
 * Used by components (e.g. PromptsDialog) that need to search/scroll
 * a terminal without holding a direct ref.
 */
import type { Terminal } from '@xterm/xterm';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalEntry {
  terminal: Terminal;
  searchAddon: SearchAddon;
  // Test-only hook for flipping bracketed-paste state without round-tripping
  // through the PTY data listener. Production code never calls this.
  setBracketedPasteForTest?: (value: boolean) => void;
}

const registry = new Map<string, TerminalEntry>();

export function registerTerminal(
  id: string,
  terminal: Terminal,
  searchAddon: SearchAddon,
  setBracketedPasteForTest?: (value: boolean) => void,
): void {
  registry.set(id, { terminal, searchAddon, setBracketedPasteForTest });
}

export function unregisterTerminal(id: string): void {
  registry.delete(id);
}

export function getTerminalEntry(id: string): TerminalEntry | undefined {
  return registry.get(id);
}

export function getAllTerminals(): Terminal[] {
  return Array.from(registry.values()).map((e) => e.terminal);
}

/**
 * Best-effort read of the text the user has typed on the current input line,
 * used to seed the prompt composer. Reads the cursor row up to the caret and
 * strips terminal chrome: box-drawing chars (AI-CLI input boxes) and a leading
 * shell prompt (PowerShell / cmd / generic `>`/`❯`). Heuristic - returns '' if
 * nothing meaningful is found.
 */
// Box-drawing / block chars (the borders of Copilot/Claude input boxes) become
// spaces so they don't pollute the captured text. A row that is *only* border
// chars therefore cleans to blank, which we use as a boundary.
function cleanRow(buf: { getLine: (r: number) => { translateToString: (t: boolean) => string } | undefined }, row: number): string | null {
  const l = buf.getLine(row);
  if (!l) return null;
  return l.translateToString(true).replace(/[─-▟]/g, ' ');
}

function looksLikePrompt(s: string): boolean {
  const t = s.trim();
  return /^PS [^>]*>/.test(t) || /^[A-Za-z]:\\[^>]*>/.test(t) || /^[>❯➜»]/.test(t);
}

interface BufferLineLike { isWrapped: boolean; translateToString(trim: boolean): string; }
interface BufferLike {
  baseY: number;
  cursorY: number;
  length: number;
  getLine(row: number): BufferLineLike | undefined;
}

export function getCurrentInputLine(id: string): string {
  const entry = registry.get(id);
  if (!entry) return '';
  return extractInputLineFromBuffer(entry.terminal.buffer.active as unknown as BufferLike);
}

/**
 * Pure buffer-parsing core of getCurrentInputLine, split out so it can be unit
 * tested with a mock buffer (no live xterm needed).
 */
export function extractInputLineFromBuffer(buf: BufferLike): string {
  const cursorRow = buf.baseY + buf.cursorY;

  // Reconstruct the whole input block, not just the caret's row. Two cases:
  //  - long input soft-wrapped across rows (xterm marks continuations
  //    `isWrapped`) - join those without a newline;
  //  - genuine multi-line input typed into an AI-CLI box ("aaa"⏎"vvv") - those
  //    are separate rows, joined with newlines.
  // We bound the block by walking up from the caret over contiguous content
  // rows, stopping at a blank row (box border cleans to blank), a shell prompt,
  // or the top of the buffer.
  let end = cursorRow;
  while (end + 1 < buf.length) {
    const l = buf.getLine(end + 1);
    if (l && l.isWrapped) end++;
    else break;
  }
  let start = cursorRow;
  for (let guard = 0; guard < 100 && start > 0; guard++) {
    const cur = buf.getLine(start);
    if (cur && cur.isWrapped) { start--; continue; } // continuation - keep climbing
    // The current row is itself a prompt / input line - a shell prompt, or an
    // inline AI-CLI box prompt like "> ...". It's the top of the input box, so
    // stop here and never climb above it into the agent's output that sits
    // directly above the box. Without this, opening the Prompt Editor on a busy
    // AI CLI pane seeded the editor with the agent's streaming output instead of
    // the user's input line (TASK-255).
    const curClean = cleanRow(buf, start);
    if (curClean !== null && looksLikePrompt(curClean)) break;
    const prev = cleanRow(buf, start - 1);
    if (prev === null || prev.trim() === '' || looksLikePrompt(prev)) break;
    start--;
  }

  // Build the block: continuations append in place, new logical lines add a \n.
  let text = '';
  for (let row = start; row <= end; row++) {
    const l = buf.getLine(row);
    const clean = cleanRow(buf, row) ?? '';
    if (row === start) text = clean;
    else if (l && l.isWrapped) text += clean;
    else text += '\n' + clean;
  }

  // Strip a leading shell prompt from the first line, if present.
  text = text
    .replace(/^PS [^>]*>\s*/, '')
    .replace(/^[A-Za-z]:\\[^>]*>\s*/, '')
    .replace(/^[>❯➜»]\s*/, '');

  // Remove the uniform left padding an input box adds to every row (dedent),
  // then trim trailing whitespace per line and surrounding blank space.
  const lines = text.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => (l.match(/^ */)?.[0].length ?? 0));
  const dedent = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(dedent).replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .trim();
}
