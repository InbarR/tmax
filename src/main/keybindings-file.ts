import * as fs from 'fs';
import * as path from 'path';
import type { Keybinding } from './config-store';

// VSCode-style keybindings.json on disk. Lives at <userData>/keybindings.json.
// Format: a top-level JSON array of `{ key, action }` objects, with `//` line
// comments tolerated (so we can ship a doc-comment header). Trailing commas
// also accepted - friendlier when users edit by hand. (TASK-39)

export const KEYBINDINGS_FILE_NAME = 'keybindings.json';

const HEADER_TEMPLATE = (actions: string[]): string => `// tmax keybindings
//
// Edits here take effect immediately - no app restart needed.
// Schema: a JSON array of { "key": "<accelerator>", "action": "<actionId>" }.
//
// Modifiers: Ctrl, Shift, Alt, Meta. Examples: "Ctrl+T", "Ctrl+Shift+W",
// "Shift+ArrowUp". On macOS, Meta is interpreted as Cmd; Ctrl in this file
// matches Cmd on Mac via the existing isMac convention.
//
// To unbind a default, remove its entry. To bind multiple keys to the same
// action, list multiple entries with the same "action" value.
//
// Available actions:
${actions.map((a) => `//   - ${a}`).join('\n')}
//
// Trailing commas and // line comments are allowed. Malformed entries are
// logged to the developer console and ignored - the rest of the file still
// applies, so a typo never locks you out of your shortcuts.

`;

/** Strip `//` line comments without breaking `//` inside string literals. */
function stripLineComments(input: string): string {
  const out: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    const idx = inlineCommentIndex(line);
    out.push(idx >= 0 ? line.slice(0, idx) : line);
  }
  return out.join('\n');
}

function inlineCommentIndex(line: string): number {
  let inStr = false;
  let escape = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (escape) { escape = false; continue; }
    if (inStr && c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr && c === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,(\s*[\]}])/g, '$1');
}

export function parseKeybindingsContent(content: string, onWarn?: (msg: string) => void): Keybinding[] {
  const cleaned = stripTrailingCommas(stripLineComments(content));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    onWarn?.(`keybindings.json: parse error - ${(err as Error).message}. File ignored.`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    onWarn?.('keybindings.json: top-level value must be a JSON array. File ignored.');
    return [];
  }
  const out: Keybinding[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i] as Partial<Keybinding> | undefined;
    if (!entry || typeof entry !== 'object') {
      onWarn?.(`keybindings.json: entry ${i} is not an object - skipped.`);
      continue;
    }
    const { key, action } = entry as Keybinding;
    if (typeof key !== 'string' || !key) {
      onWarn?.(`keybindings.json: entry ${i} missing string "key" - skipped.`);
      continue;
    }
    if (typeof action !== 'string' || !action) {
      onWarn?.(`keybindings.json: entry ${i} missing string "action" - skipped.`);
      continue;
    }
    out.push({ key, action });
  }
  return out;
}

export function serializeKeybindings(bindings: Keybinding[], availableActions: string[]): string {
  const body = JSON.stringify(
    bindings.map((b) => ({ key: b.key, action: b.action })),
    null,
    2,
  );
  return HEADER_TEMPLATE(availableActions) + body + '\n';
}

export class KeybindingsFile {
  private filePath: string;
  private watcher: fs.FSWatcher | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private listeners = new Set<(b: Keybinding[]) => void>();
  private availableActions: string[];

  constructor(userDataDir: string, availableActions: string[]) {
    this.filePath = path.join(userDataDir, KEYBINDINGS_FILE_NAME);
    this.availableActions = [...availableActions].sort();
  }

  getPath(): string {
    return this.filePath;
  }

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /**
   * Read + parse the file. Returns an empty array (with a warning) when the
   * file is missing or malformed. Use `init()` instead if you also want the
   * file created on first run.
   */
  read(onWarn?: (msg: string) => void): Keybinding[] {
    if (!fs.existsSync(this.filePath)) return [];
    let content: string;
    try {
      content = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      onWarn?.(`keybindings.json: read failed - ${(err as Error).message}`);
      return [];
    }
    return parseKeybindingsContent(content, onWarn);
  }

  /**
   * Create the file with `defaults` if it doesn't exist, then return the
   * parsed contents. Existing files are read as-is.
   */
  init(defaults: Keybinding[], onWarn?: (msg: string) => void): Keybinding[] {
    if (!fs.existsSync(this.filePath)) {
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, serializeKeybindings(defaults, this.availableActions), 'utf8');
      } catch (err) {
        onWarn?.(`keybindings.json: write failed - ${(err as Error).message}`);
        return defaults;
      }
    }
    return this.read(onWarn);
  }

  /** Rewrite the file from `defaults`, overwriting any user edits. */
  resetToDefaults(defaults: Keybinding[]): Keybinding[] {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, serializeKeybindings(defaults, this.availableActions), 'utf8');
    return this.read();
  }

  /**
   * Subscribe to file changes. Editor saves often produce multiple change
   * events in quick succession (atomic-write pattern), so we debounce by
   * 150ms. Returns an unsubscribe function.
   */
  onChange(cb: (b: Keybinding[]) => void): () => void {
    this.listeners.add(cb);
    if (!this.watcher) this.startWatcher();
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) this.stopWatcher();
    };
  }

  private startWatcher(): void {
    if (this.watcher) return;
    try {
      // Watch the parent dir, not the file itself - editors that swap files
      // (write to .tmp then rename) break a direct file watcher.
      this.watcher = fs.watch(path.dirname(this.filePath), { persistent: false }, (_event, filename) => {
        if (!filename || path.basename(filename) !== KEYBINDINGS_FILE_NAME) return;
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
          const bindings = this.read();
          for (const cb of this.listeners) cb(bindings);
        }, 150);
      });
    } catch (err) {
      // fs.watch can fail on some platforms / filesystems (network mounts,
      // missing directory). Hot reload won't work but the rest still does.
      // eslint-disable-next-line no-console
      console.warn(`[keybindings] file watch unavailable: ${(err as Error).message}`);
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      try { this.watcher.close(); } catch { /* ignore */ }
      this.watcher = null;
    }
    if (this.debounce) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
  }

  dispose(): void {
    this.listeners.clear();
    this.stopWatcher();
  }
}
