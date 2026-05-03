import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSessionEvents, clearParserCache, extractCopilotPrompts } from './copilot-events-parser';
import type {
  CopilotSession,
  CopilotSessionSummary,
  CopilotWorkspaceMetadata,
} from '../shared/copilot-types';

export interface CopilotMonitorCallbacks {
  onSessionUpdated?: (session: CopilotSessionSummary) => void;
  onSessionAdded?: (session: CopilotSessionSummary) => void;
  onSessionRemoved?: (sessionId: string) => void;
}

export class CopilotSessionMonitor {
  private sessions = new Map<string, CopilotSession>();
  private callbacks: CopilotMonitorCallbacks = {};
  private readonly basePath: string;
  private readonly wslDistro?: string;
  /** Total eligible sessions found in the last scanSessions() call. */
  lastTotalEligible = 0;
  /** Cached candidate list from the last full stat scan, sorted by mtime desc. */
  private cachedCandidates: { sessionId: string; sessionDir: string; mtime: number }[] | null = null;

  constructor(options?: { basePath?: string; wslDistro?: string }) {
    this.basePath = options?.basePath ?? path.join(os.homedir(), '.copilot', 'session-state');
    this.wslDistro = options?.wslDistro;
  }

  setCallbacks(callbacks: CopilotMonitorCallbacks): void {
    this.callbacks = callbacks;
  }

  getBasePath(): string {
    return this.basePath;
  }

  async scanSessions(limit = 50): Promise<CopilotSessionSummary[]> {
    const summaries: CopilotSessionSummary[] = [];

    // Phase 1: build or reuse cached candidate list
    // Uses sync stat - fast (~300ms) and only runs once (cached after).
    if (!this.cachedCandidates) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(this.basePath, { withFileTypes: true });
      } catch {
        return summaries;
      }

      const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - maxAgeMs;
      const candidates: { sessionId: string; sessionDir: string; mtime: number }[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionId = entry.name;
        const sessionDir = path.join(this.basePath, sessionId);
        // Prefer events.jsonl mtime (activity file) over workspace.yaml
        let mtime = 0;
        try {
          mtime = fs.statSync(path.join(sessionDir, 'events.jsonl')).mtimeMs;
        } catch {
          try { mtime = fs.statSync(path.join(sessionDir, 'workspace.yaml')).mtimeMs; } catch { continue; }
        }
        if (mtime < cutoff) continue;
        candidates.push({ sessionId, sessionDir, mtime });
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
    for (const { sessionId, sessionDir } of top) {
      currentIds.add(sessionId);

      // Skip re-parsing sessions already in memory
      if (this.sessions.has(sessionId)) {
        summaries.push(this.toSummary(this.sessions.get(sessionId)!));
        continue;
      }

      const session = this.loadSession(sessionId, sessionDir);

      if (session) {
        this.sessions.set(sessionId, session);
        const summary = this.toSummary(session);
        summaries.push(summary);
        this.callbacks.onSessionAdded?.(summary);
      } else {
        // Remove failed candidate so totalEligible stays accurate
        this.cachedCandidates = candidates.filter(c => c.sessionId !== sessionId);
        this.lastTotalEligible = this.cachedCandidates.length;
      }

      // Yield to event loop every 10 parses so the UI stays responsive
      if (++parseCount % 10 === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }

    // Silently evict sessions outside the top N from memory and parser cache.
    // Do NOT fire onSessionRemoved — these sessions still exist on disk, they're
    // just outside the current load window. onSessionRemoved is reserved for
    // sessions truly deleted from disk (handled by handleSessionRemoved).
    for (const [id] of this.sessions) {
      if (!currentIds.has(id)) {
        this.sessions.delete(id);
        clearParserCache(path.join(this.basePath, id, 'events.jsonl'));
      }
    }

    return summaries;
  }

  /** Invalidate the cached candidate list so the next scanSessions() re-stats. */
  invalidateCache(): void {
    this.cachedCandidates = null;
  }

  getSession(id: string): CopilotSession | null {
    return this.sessions.get(id) ?? null;
  }

  refreshSession(id: string): CopilotSessionSummary | null {
    const sessionDir = path.join(this.basePath, id);
    if (!fs.existsSync(sessionDir)) {
      if (this.sessions.has(id)) {
        this.sessions.delete(id);
        clearParserCache(path.join(sessionDir, 'events.jsonl'));
        this.callbacks.onSessionRemoved?.(id);
      }
      return null;
    }

    const session = this.loadSession(id, sessionDir);
    if (!session) return null;

    const oldSession = this.sessions.get(id);
    this.sessions.set(id, session);
    const summary = this.toSummary(session);

    if (oldSession && (oldSession.status !== session.status ||
        oldSession.messageCount !== session.messageCount ||
        oldSession.toolCallCount !== session.toolCallCount ||
        oldSession.latestPrompt !== session.latestPrompt)) {
      this.callbacks.onSessionUpdated?.(summary);
    }

    return summary;
  }

  searchSessions(query: string): CopilotSessionSummary[] {
    const q = query.toLowerCase();
    const results: CopilotSessionSummary[] = [];

    for (const [, session] of this.sessions) {
      const { workspace } = session;
      if (
        workspace.repository.toLowerCase().includes(q) ||
        workspace.branch.toLowerCase().includes(q) ||
        workspace.cwd.toLowerCase().includes(q) ||
        workspace.name.toLowerCase().includes(q) ||
        session.id.toLowerCase().includes(q)
      ) {
        results.push(this.toSummary(session));
      } else {
        // Search through prompts
        const prompts = this.getPrompts(session.id);
        if (prompts.some((p) => p.toLowerCase().includes(q))) {
          results.push(this.toSummary(session));
        }
      }
    }

    return results;
  }

  // TASK-85: default cap matches the parser's default of 10. Callers can
  // still pass a higher limit if they need deeper history.
  getPrompts(sessionId: string, limit = 10): string[] {
    const eventsPath = path.join(this.basePath, sessionId, 'events.jsonl');
    return extractCopilotPrompts(eventsPath, limit);
  }

  handleEventsChanged(sessionId: string): void {
    // Promote the session to the front of the cached candidate list
    if (this.cachedCandidates) {
      const idx = this.cachedCandidates.findIndex(c => c.sessionId === sessionId);
      if (idx > 0) {
        const [entry] = this.cachedCandidates.splice(idx, 1);
        entry.mtime = Date.now();
        this.cachedCandidates.unshift(entry);
      }
    }
    this.refreshSession(sessionId);
  }

  handleNewSession(sessionId: string): void {
    const sessionDir = path.join(this.basePath, sessionId);
    // Insert into cached candidates so "load more" sees the new session
    if (this.cachedCandidates) {
      const wsPath = path.join(sessionDir, 'workspace.yaml');
      let mtime = Date.now();
      try { mtime = fs.statSync(wsPath).mtimeMs; } catch {
        try { mtime = fs.statSync(path.join(sessionDir, 'events.jsonl')).mtimeMs; } catch { /* use now */ }
      }
      // Prepend (newest first) if not already present
      if (!this.cachedCandidates.some(c => c.sessionId === sessionId)) {
        this.cachedCandidates.unshift({ sessionId, sessionDir, mtime });
        this.lastTotalEligible = this.cachedCandidates.length;
      }
    }
    const session = this.loadSession(sessionId, sessionDir);
    if (session) {
      this.sessions.set(sessionId, session);
      this.callbacks.onSessionAdded?.(this.toSummary(session));
    }
  }

  handleSessionRemoved(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      clearParserCache(path.join(this.basePath, sessionId, 'events.jsonl'));
      this.callbacks.onSessionRemoved?.(sessionId);
    }
    // Remove from cached candidates
    if (this.cachedCandidates) {
      this.cachedCandidates = this.cachedCandidates.filter(c => c.sessionId !== sessionId);
      this.lastTotalEligible = this.cachedCandidates.length;
    }
  }

  dispose(): void {
    this.sessions.clear();
  }

  /** Re-check only recently active sessions in memory (no directory scan). */
  refreshLoadedSessions(): void {
    for (const [id, session] of this.sessions) {
      // Only refresh sessions that might be in a stale "thinking" state.
      // Idle sessions with no recent activity don't need re-checking.
      if (session.status !== 'idle') {
        this.refreshSession(id);
      }
    }
  }

  private loadSession(id: string, sessionDir: string): CopilotSession | null {
    const workspace = this.parseWorkspace(sessionDir);
    const eventsPath = path.join(sessionDir, 'events.jsonl');

    const parsed = fs.existsSync(eventsPath) ? parseSessionEvents(eventsPath) : null;

    // If no summary from workspace.yaml, use first prompt as the display name
    if (!workspace.summary && workspace.name === id) {
      const prompts = extractCopilotPrompts(eventsPath, 1);
      if (prompts.length > 0) {
        workspace.summary = prompts[0].slice(0, 60);
        workspace.name = workspace.summary;
      }
    }

    return {
      id,
      status: parsed?.status ?? 'idle',
      workspace,
      messageCount: parsed?.messageCount ?? 0,
      toolCallCount: parsed?.toolCallCount ?? 0,
      lastActivityTime: parsed?.lastActivityTime ?? 0,
      pendingToolCalls: parsed?.pendingToolCalls ?? 0,
      totalTokens: parsed?.totalTokens ?? 0,
      latestPrompt: parsed?.latestPrompt || undefined,
      latestPromptTime: parsed?.latestPromptTime || undefined,
    };
  }

  private parseWorkspace(sessionDir: string): CopilotWorkspaceMetadata {
    const wsPath = path.join(sessionDir, 'workspace.yaml');
    const defaults: CopilotWorkspaceMetadata = {
      cwd: '',
      branch: '',
      repository: '',
      name: path.basename(sessionDir),
      summary: '',
    };

    if (!fs.existsSync(wsPath)) return defaults;

    try {
      const content = fs.readFileSync(wsPath, 'utf-8');
      const result = { ...defaults };

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const indent = line.length - line.trimStart().length;
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        // Handle values that may contain colons (e.g. timestamps, URLs)
        let value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

        // YAML block scalars: `|`, `|-`, `|+`, `>`, `>-`, `>+`. Copilot CLI
        // writes summaries that span multiple lines using `summary: |-`
        // followed by an indented block. The previous line-by-line parser
        // took `|-` as the literal value, leaving the sidebar showing the
        // YAML indicator instead of the actual prompt. Collapse the block
        // into a single space-joined string - good enough for the
        // single-line title we render.
        if (/^[|>][-+]?\s*$/.test(value)) {
          const blockLines: string[] = [];
          while (i + 1 < lines.length) {
            const next = lines[i + 1];
            if (next.trim() === '') { blockLines.push(''); i++; continue; }
            const nextIndent = next.length - next.trimStart().length;
            if (nextIndent <= indent) break;
            blockLines.push(next.trim());
            i++;
          }
          value = blockLines.join(' ').trim();
        }

        switch (key) {
          case 'cwd':
            result.cwd = value;
            break;
          case 'branch':
            result.branch = value;
            break;
          case 'repository':
            result.repository = value;
            break;
          case 'summary':
            result.summary = value;
            break;
        }
      }

      // Derive display name: summary > repo > folder name
      if (result.summary) {
        result.name = result.summary;
      } else if (result.repository) {
        result.name = result.repository.split('/').pop() || result.repository;
      } else if (result.cwd) {
        const parts = result.cwd.replace(/[/\\]+$/, '').split(/[/\\]/);
        result.name = parts[parts.length - 1] || result.cwd;
      }

      return result;
    } catch {
      return defaults;
    }
  }

  private toSummary(session: CopilotSession): CopilotSessionSummary {
    const summary: CopilotSessionSummary = {
      id: session.id,
      provider: 'copilot',
      status: session.status,
      cwd: session.workspace.cwd,
      branch: session.workspace.branch,
      repository: session.workspace.repository,
      summary: session.workspace.summary,
      latestPrompt: session.latestPrompt || undefined,
      latestPromptTime: session.latestPromptTime || undefined,
      messageCount: session.messageCount,
      toolCallCount: session.toolCallCount,
      lastActivityTime: session.lastActivityTime,
    };

    if (this.wslDistro) {
      summary.wsl = true;
      summary.wslDistro = this.wslDistro;
    }

    return summary;
  }
}
