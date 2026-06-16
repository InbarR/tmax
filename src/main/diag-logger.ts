import { appendFile, writeFile, stat, open } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import os from 'node:os';

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB — rotate when exceeded
const FLUSH_INTERVAL = 500; // ms — batch writes to reduce I/O
let logPath = '';
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let rotating = false;

export function initDiagLogger(): string {
  logPath = join(app.getPath('userData'), 'tmax-diag.log');
  diagLog('app:start', { version: app.getVersion(), time: new Date().toISOString() });
  return logPath;
}

export function getDiagLogPath(): string {
  return logPath;
}

function sanitize(s: string, maxLen = 40): string {
  return s.slice(0, maxLen).replace(/[\x00-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

// PII redaction applied to every diag payload so logs can be shared for
// debugging without leaking the user's identity. Strips the home directory and
// username out of any field (paths in cwd/shell/title, etc.). Resolved once.
const HOME_DIR = (() => { try { return os.homedir(); } catch { return ''; } })();
const USER_NAME = (() => { try { return os.userInfo().username; } catch { return ''; } })();
const USER_RE = USER_NAME && USER_NAME.length > 2
  ? new RegExp('\\b' + USER_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')
  : null;

function redactStr(s: string): string {
  let out = s;
  // Real home dir -> ~ (this removes the embedded username for the current user).
  if (HOME_DIR && HOME_DIR.length > 3) out = out.split(HOME_DIR).join('~');
  // Any other user's home path: /Users/<name>, /home/<name>, C:\Users\<name>.
  out = out.replace(/([/\\])(Users|home)([/\\])[^/\\]+/gi, '$1$2$3<user>');
  // Bare username elsewhere (e.g. inside a process title). Word-boundary so it
  // can't corrupt substrings like a "max" inside "tmax".
  if (USER_RE) out = out.replace(USER_RE, '<user>');
  return out;
}

// Redact every string value in a diag payload. Runs on the object BEFORE
// serialization so OS paths match os.homedir() without JSON backslash-escaping.
function redactPII(v: unknown): unknown {
  if (typeof v === 'string') return redactStr(v);
  if (Array.isArray(v)) return v.map(redactPII);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      o[k] = redactPII((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}

async function flush(): Promise<void> {
  if (buffer.length === 0 || !logPath || rotating) return;
  const lines = buffer.join('');
  buffer = [];
  try {
    const s = await stat(logPath).catch(() => null);
    if (s && s.size > MAX_SIZE) {
      rotating = true;
      await writeFile(logPath, `--- log rotated at ${new Date().toISOString()} ---\n`);
      rotating = false;
    }
    await appendFile(logPath, lines);
  } catch { /* ignore write errors */ }
}

export function diagLog(event: string, data?: Record<string, unknown>): void {
  if (!logPath) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const payload = data ? ' ' + JSON.stringify(redactPII(data)) : '';
  buffer.push(`${ts} ${event}${payload}\n`);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL);
  }
}

export { sanitize };

/**
 * Read the last `maxBytes` of the diag log. Used by the Report-an-issue
 * flow to auto-attach context (TASK-164). Flushes any buffered lines
 * first so the tail includes everything up to "now". Returns '' if the
 * file is missing or unreadable — the caller falls back to no attachment.
 */
export async function readDiagLogTail(maxBytes = 25 * 1024): Promise<string> {
  if (!logPath) return '';
  await flush();
  try {
    const s = await stat(logPath).catch(() => null);
    if (!s) return '';
    const start = Math.max(0, s.size - maxBytes);
    const fh = await open(logPath, 'r');
    try {
      const buf = Buffer.alloc(s.size - start);
      await fh.read(buf, 0, buf.length, start);
      let text = buf.toString('utf-8');
      // If we sliced mid-line, drop the leading partial so the first
      // line in the output is a complete log entry.
      if (start > 0) {
        const nl = text.indexOf('\n');
        if (nl >= 0) text = text.slice(nl + 1);
      }
      return text;
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}
