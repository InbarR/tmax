// TASK-262: detect the current working directory from a chunk of PTY output.
//
// PTY output is delivered in batches (pty-manager coalesces chunks), so a
// single chunk can contain several prompt lines - e.g. a few blank
// "PS C:\projects>" prompts followed by "cd c:\users" and the new
// "PS C:\Users>". We must resolve to the LAST (most recent) directory in the
// chunk, not the first; otherwise the pane's tracked cwd latches onto a stale
// folder and the File Explorer sidebar follows it there.
//
// Three detection methods, in priority order:
//   1. OSC 7 (standard):            \x1b]7;file:///C:/path\x07
//   2. OSC 9;9 (ConPTY / WT):       \x1b]9;9;C:\path\x07
//   3. Prompt-text fallback:        "PS C:\path>" or "C:\path>"

/** Return the capture group from the LAST match of a global regex, or null. */
function lastCapture(str: string, re: RegExp): string | null {
  let result: string | null = null;
  for (const m of str.matchAll(re)) {
    result = m[1];
  }
  return result;
}

/**
 * Detect the working directory from a chunk of raw PTY output.
 * Returns the detected absolute path, or null when nothing matched.
 *
 * @param data  raw PTY chunk (may contain ANSI/OSC escapes and multiple prompts)
 * @param isWsl whether this pane runs a WSL shell (keep Linux-style paths)
 */
export function detectCwdFromChunk(data: string, isWsl: boolean): string | null {
  // 1. OSC 7 (file URI). Take the last emission in the chunk.
  const osc7 = lastCapture(data, /\x1b\]7;file:\/\/[^/]*\/([^\x07\x1b]+)(?:\x07|\x1b\\)/g);
  if (osc7) {
    const decoded = decodeURIComponent(osc7);
    if (isWsl) {
      // WSL: keep Linux-style forward slashes; prefix with / for absolute path
      return '/' + decoded;
    }
    if (/^[A-Za-z]:/.test(decoded)) {
      // Windows path (C:/Users/...) - convert to backslashes
      return decoded.replace(/\//g, '\\');
    }
    // macOS/Linux path - keep forward slashes, ensure leading /
    return decoded.startsWith('/') ? decoded : '/' + decoded;
  }

  // 2. OSC 9;9 (Windows Terminal / ConPTY). Take the last emission.
  const osc9 = lastCapture(data, /\x1b\]9;9;([^\x07\x1b]+)(?:\x07|\x1b\\)/g);
  if (osc9) return osc9;

  // 3. Fallback: parse prompt text for standard PS/cmd prompts. Strip escapes
  // first, then take the last prompt line in the chunk.
  const clean = data
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // OSC sequences
    .replace(/\x1b\[[?]?[0-9;]*[A-Za-z]/g, '')            // CSI sequences (including ?25h/l)
    .replace(/\x1b[^[\]].?/g, '');                         // Other short escapes
  const psDir = lastCapture(clean, /PS ([A-Z]:\\[^>]*?)>\s*$/gim);
  if (psDir) return psDir;
  const cmdDir = lastCapture(clean, /^([A-Z]:\\[^>]*?)>\s*$/gim);
  if (cmdDir) return cmdDir;

  return null;
}
