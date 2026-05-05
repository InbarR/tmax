import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditEntry } from './types';

/**
 * Append-only NDJSON audit log of every MCP tool call.
 *
 * One line per call. Rotated at AUDIT_ROTATE_BYTES by renaming to a `.1`
 * sibling (single-generation rotation — we don't keep history beyond that;
 * the goal is forensic traceability for the most recent session, not a SIEM).
 *
 * Path is set once at boot via `setAuditPath` (main resolves `app.getPath('logs')`).
 */

const AUDIT_ROTATE_BYTES = 10 * 1024 * 1024;

let auditPath: string | null = null;

export function setAuditPath(p: string): void {
  auditPath = p;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // If we can't create the directory, just disable auditing — the app
    // shouldn't crash because logs aren't writable.
    auditPath = null;
  }
}

export function getAuditPath(): string | null {
  return auditPath;
}

export function audit(entry: Omit<AuditEntry, 'ts'>): void {
  if (!auditPath) return;
  const full: AuditEntry = { ts: Date.now(), ...entry };
  const line = JSON.stringify(full) + '\n';
  try {
    // Best-effort rotation. Don't crash on stat or rename failure.
    try {
      const st = fs.statSync(auditPath);
      if (st.size + line.length > AUDIT_ROTATE_BYTES) {
        const rotated = auditPath + '.1';
        try { fs.rmSync(rotated, { force: true }); } catch { /* ignore */ }
        fs.renameSync(auditPath, rotated);
      }
    } catch { /* file doesn't exist yet — fine */ }
    fs.appendFileSync(auditPath, line, 'utf-8');
  } catch {
    // Don't propagate audit errors — they must not break tool execution.
  }
}

/**
 * Returns the most recent N audit entries (best-effort, parses both rotated
 * and current files). Used by the renderer's audit viewer.
 */
export function readRecentAudit(limit = 200): AuditEntry[] {
  if (!auditPath) return [];
  const lines: string[] = [];
  for (const p of [auditPath + '.1', auditPath]) {
    try {
      if (!fs.existsSync(p)) continue;
      const txt = fs.readFileSync(p, 'utf-8');
      for (const l of txt.split('\n')) {
        if (l.trim()) lines.push(l);
      }
    } catch { /* skip */ }
  }
  const tail = lines.slice(-limit);
  const out: AuditEntry[] = [];
  for (const l of tail) {
    try { out.push(JSON.parse(l) as AuditEntry); } catch { /* ignore malformed */ }
  }
  return out;
}
