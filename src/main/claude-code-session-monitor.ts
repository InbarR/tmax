import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseClaudeCodeSession,
  clearClaudeCodeCache,
  extractClaudeCodePrompts,
} from './claude-code-events-parser';
import type { CopilotSessionSummary } from '../shared/copilot-types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export interface ClaudeCodeMonitorCallbacks {
  onSessionUpdated?: (session: CopilotSessionSummary) => void;
  onSessionAdded?: (session: CopilotSessionSummary) => void;
  onSessionRemoved?: (sessionId: string) => void;
}

export class ClaudeCodeSessionMonitor {
  /** sessionId → summary */
  private sessions = new Map<string, CopilotSessionSummary>();
  /** sessionId → file path */
  private filePaths = new Map<string, string>();
  private callbacks: ClaudeCodeMonitorCallbacks = {};
  private readonly basePath: string;
  private readonly wslDistro?: string;
  /** Total eligible sessions found in the last scanSessions() call. */
  lastTotalEligible = 0;
  /** Cached candidate list from the last full stat scan, sorted by mtime desc. */
  private cachedCandidates: { filePath: string; mtime: number }[] | null = null;

  constructor(options?: { basePath?: string; wslDistro?: string }) {
    this.basePath = options?.basePath ?? path.join(os.homedir(), '.claude', 'projects');
    this.wslDistro = options?.wslDistro;
  }

  setCallbacks(callbacks: ClaudeCodeMonitorCallbacks): void {
    this.callbacks = callbacks;
  }

  getBasePath(): string {
    return this.basePath;
  }

  // ── Full scan ────────────────────────────────────────────────────────

  async scanSessions(limit = 314): Promise<CopilotSessionSummary[]> {
    const summaries: CopilotSessionSummary[] = [];

    // Phase 1: build or reuse cached candidate list
    // Uses sync stat - fast and only runs once (cached after).
    if (!this.cachedCandidates) {
      let projectDirs: fs.Dirent[];
      try {
        projectDirs = fs.readdirSync(this.basePath, { withFileTypes: true });
      } catch {
        return summaries;
      }

      const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - maxAgeMs;
      const candidates: { filePath: string; mtime: number }[] = [];

      for (const projEntry of projectDirs) {
        if (!projEntry.isDirectory()) continue;
        const projDir = path.join(this.basePath, projEntry.name);
        let files: fs.Dirent[];
        try { files = fs.readdirSync(projDir, { withFileTypes: true }); } catch { continue; }

        for (const fileEntry of files) {
          if (!fileEntry.isFile() || !UUID_RE.test(fileEntry.name)) continue;
          const filePath = path.join(projDir, fileEntry.name);
          let mtime = 0;
          try { mtime = fs.statSync(filePath).mtimeMs; } catch { continue; }
          if (mtime < cutoff) continue;
          candidates.push({ filePath, mtime });
        }
      }

      candidates.sort((a, b) => b.mtime - a.mtime);
      this.cachedCandidates = candidates;
    }

    const candidates = this.cachedCandidates;
    this.lastTotalEligible = candidates.length;

    // Phase 2: parse only the top N (skipping already-loaded sessions)
    const top = candidates.slice(0, limit);
    const currentIds = new Set<string>();

    let parseCount = 0;
    for (const { filePath } of top) {
      // Check if already loaded by file path
      let existingId: string | null = null;
      for (const [id, fp] of this.filePaths) {
        if (fp === filePath) { existingId = id; break; }
      }

      if (existingId && this.sessions.has(existingId)) {
        currentIds.add(existingId);
        summaries.push(this.sessions.get(existingId)!);
        continue;
      }

      const summary = this.loadSession(filePath);

      if (summary) {
        currentIds.add(summary.id);
        this.sessions.set(summary.id, summary);
        this.filePaths.set(summary.id, filePath);
        summaries.push(summary);
        this.callbacks.onSessionAdded?.(summary);
      } else {
        // Remove failed candidate so totalEligible stays accurate
        this.cachedCandidates = candidates.filter(c => c.filePath !== filePath);
        this.lastTotalEligible = this.cachedCandidates.length;
      }

      // Yield to event loop every 10 parses so the UI stays responsive
      if (++parseCount % 10 === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }

    // Silently evict sessions outside the top N from memory and parser cache.
    // Do NOT fire onSessionRemoved — these sessions still exist on disk.
    for (const [id, fp] of this.filePaths) {
      if (!currentIds.has(id)) {
        this.sessions.delete(id);
        this.filePaths.delete(id);
        clearClaudeCodeCache(fp);
      }
    }

    return summaries;
  }

  /** Invalidate the cached candidate list so the next scanSessions() re-stats. */
  invalidateCache(): void {
    this.cachedCandidates = null;
  }

  // ── Single-session refresh ───────────────────────────────────────────

  refreshSession(filePath: string): CopilotSessionSummary | null {
    if (!fs.existsSync(filePath)) {
      // File was deleted → find and remove session
      for (const [id, fp] of this.filePaths) {
        if (fp === filePath) {
          this.sessions.delete(id);
          this.filePaths.delete(id);
          clearClaudeCodeCache(fp);
          this.callbacks.onSessionRemoved?.(id);
          break;
        }
      }
      return null;
    }

    const summary = this.loadSession(filePath);
    if (!summary) return null;

    const old = this.sessions.get(summary.id);
    this.sessions.set(summary.id, summary);
    this.filePaths.set(summary.id, filePath);

    if (
      old &&
      (old.status !== summary.status ||
        old.messageCount !== summary.messageCount ||
        old.toolCallCount !== summary.toolCallCount ||
        old.summary !== summary.summary ||
        old.latestPrompt !== summary.latestPrompt)
    ) {
      this.callbacks.onSessionUpdated?.(summary);
    }

    return summary;
  }

  // ── Accessors ────────────────────────────────────────────────────────

  getSession(id: string): CopilotSessionSummary | null {
    return this.sessions.get(id) ?? null;
  }

  searchSessions(query: string): CopilotSessionSummary[] {
    const q = query.toLowerCase();
    const results: CopilotSessionSummary[] = [];

    for (const [, summary] of this.sessions) {
      if (
        summary.summary.toLowerCase().includes(q) ||
        summary.branch.toLowerCase().includes(q) ||
        summary.cwd.toLowerCase().includes(q) ||
        summary.id.toLowerCase().includes(q)
      ) {
        results.push(summary);
      } else {
        // Search through prompts
        const prompts = this.getPrompts(summary.id);
        if (prompts.some((p) => p.toLowerCase().includes(q))) {
          results.push(summary);
        }
      }
    }

    return results;
  }

  // TASK-85: default cap matches the parser's default of 10.
  getPrompts(sessionId: string, limit = 10): string[] {
    const filePath = this.filePaths.get(sessionId);
    if (!filePath) return [];
    return extractClaudeCodePrompts(filePath, limit);
  }

  // ── Watcher callbacks ────────────────────────────────────────────────

  handleFileChanged(filePath: string): void {
    // Promote the session to the front of the cached candidate list
    if (this.cachedCandidates) {
      const idx = this.cachedCandidates.findIndex(c => c.filePath === filePath);
      if (idx > 0) {
        const [entry] = this.cachedCandidates.splice(idx, 1);
        entry.mtime = Date.now();
        this.cachedCandidates.unshift(entry);
      }
    }
    this.refreshSession(filePath);
  }

  handleNewFile(filePath: string): void {
    // Insert into cached candidates so "load more" sees the new session
    if (this.cachedCandidates) {
      let mtime = Date.now();
      try { mtime = fs.statSync(filePath).mtimeMs; } catch { /* use now */ }
      if (!this.cachedCandidates.some(c => c.filePath === filePath)) {
        this.cachedCandidates.unshift({ filePath, mtime });
        this.lastTotalEligible = this.cachedCandidates.length;
      }
    }
    const summary = this.loadSession(filePath);
    if (summary) {
      this.sessions.set(summary.id, summary);
      this.filePaths.set(summary.id, filePath);
      this.callbacks.onSessionAdded?.(summary);
    }
  }

  handleFileRemoved(filePath: string): void {
    for (const [id, fp] of this.filePaths) {
      if (fp === filePath) {
        this.sessions.delete(id);
        this.filePaths.delete(id);
        clearClaudeCodeCache(fp);
        this.callbacks.onSessionRemoved?.(id);
        break;
      }
    }
    // Remove from cached candidates
    if (this.cachedCandidates) {
      this.cachedCandidates = this.cachedCandidates.filter(c => c.filePath !== filePath);
      this.lastTotalEligible = this.cachedCandidates.length;
    }
  }

  dispose(): void {
    this.sessions.clear();
    this.filePaths.clear();
  }

  /** Re-check only recently active sessions in memory (no directory scan). */
  refreshLoadedSessions(): void {
    for (const [, summary] of this.sessions) {
      const fp = this.filePaths.get(summary.id);
      // Only refresh sessions that might be in a stale "thinking" state.
      if (fp && summary.status !== 'idle') {
        this.refreshSession(fp);
      }
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private loadSession(filePath: string): CopilotSessionSummary | null {
    const parsed = parseClaudeCodeSession(filePath);
    if (!parsed || !parsed.sessionId) return null;

    // Derive a short folder name from cwd for display context
    let cwdFolder = '';
    if (parsed.cwd) {
      const parts = parsed.cwd.replace(/[/\\]+$/, '').split(/[/\\]/);
      cwdFolder = parts[parts.length - 1] || parsed.cwd;
    }

    const summary: CopilotSessionSummary = {
      id: parsed.sessionId,
      provider: 'claude-code',
      status: parsed.status,
      cwd: parsed.cwd,
      branch: parsed.gitBranch,
      repository: '',
      summary: parsed.firstPrompt || parsed.slug || cwdFolder || '',
      slug: parsed.slug || undefined,
      latestPrompt: parsed.latestPrompt || undefined,
      latestPromptTime: parsed.latestPromptTime || undefined,
      messageCount: parsed.messageCount,
      toolCallCount: parsed.toolCallCount,
      lastActivityTime: parsed.lastActivityTime,
      model: parsed.model || undefined,
    };

    if (this.wslDistro) {
      summary.wsl = true;
      summary.wslDistro = this.wslDistro;
    }

    return summary;
  }
}
