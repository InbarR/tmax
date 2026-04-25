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

  scanSessions(): CopilotSessionSummary[] {
    const summaries: CopilotSessionSummary[] = [];

    if (!fs.existsSync(this.basePath)) return summaries;

    let projectDirs: fs.Dirent[];
    try {
      projectDirs = fs.readdirSync(this.basePath, { withFileTypes: true });
    } catch {
      return summaries;
    }

    const currentIds = new Set<string>();
    // 30 days matches the app-wide `oldSessionDays` default used by the UI's
    // stale-session detection and the "mark old" threshold. A tighter scan
    // filter would hide sessions that `claude --resume` still lists.
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;

    for (const projEntry of projectDirs) {
      if (!projEntry.isDirectory()) continue;

      const projDir = path.join(this.basePath, projEntry.name);

      let files: fs.Dirent[];
      try {
        files = fs.readdirSync(projDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const fileEntry of files) {
        if (!fileEntry.isFile() || !UUID_RE.test(fileEntry.name)) continue;

        const filePath = path.join(projDir, fileEntry.name);

        // Skip old sessions by file mtime
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) continue;
        } catch {
          continue;
        }

        const summary = this.loadSession(filePath);

        if (summary) {
          const old = this.sessions.get(summary.id);
          currentIds.add(summary.id);
          this.sessions.set(summary.id, summary);
          this.filePaths.set(summary.id, filePath);
          summaries.push(summary);

          if (!old) {
            this.callbacks.onSessionAdded?.(summary);
          } else if (
            old.status !== summary.status ||
            old.messageCount !== summary.messageCount ||
            old.toolCallCount !== summary.toolCallCount ||
            old.summary !== summary.summary ||
            old.latestPrompt !== summary.latestPrompt
          ) {
            // Chokidar's awaitWriteFinish can suppress 'change' events during
            // long streaming turns (file never stable for 300ms), so this 10s
            // fallback scan is often the only thing that ships updates.
            this.callbacks.onSessionUpdated?.(summary);
          }
        }
      }
    }

    // Detect removed sessions
    for (const [id, fp] of this.filePaths) {
      if (!currentIds.has(id)) {
        this.sessions.delete(id);
        this.filePaths.delete(id);
        clearClaudeCodeCache(fp);
        this.callbacks.onSessionRemoved?.(id);
      }
    }

    return summaries;
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

  getPrompts(sessionId: string, limit = 20): string[] {
    const filePath = this.filePaths.get(sessionId);
    if (!filePath) return [];
    return extractClaudeCodePrompts(filePath, limit);
  }

  // ── Watcher callbacks ────────────────────────────────────────────────

  handleFileChanged(filePath: string): void {
    this.refreshSession(filePath);
  }

  handleNewFile(filePath: string): void {
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
  }

  dispose(): void {
    this.sessions.clear();
    this.filePaths.clear();
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
