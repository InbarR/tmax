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

  scanSessions(): CopilotSessionSummary[] {
    const summaries: CopilotSessionSummary[] = [];

    if (!fs.existsSync(this.basePath)) {
      return summaries;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.basePath, { withFileTypes: true });
    } catch {
      return summaries;
    }

    const currentIds = new Set<string>();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = Date.now() - maxAgeMs;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionId = entry.name;
      const sessionDir = path.join(this.basePath, sessionId);

      // Quick recency check via workspace.yaml mtime before full parse
      const wsPath = path.join(sessionDir, 'workspace.yaml');
      try {
        const stat = fs.statSync(wsPath);
        if (stat.mtimeMs < cutoff) continue;
      } catch {
        // No workspace.yaml — check events.jsonl
        const evPath = path.join(sessionDir, 'events.jsonl');
        try {
          const stat = fs.statSync(evPath);
          if (stat.mtimeMs < cutoff) continue;
        } catch {
          continue;
        }
      }

      currentIds.add(sessionId);

      const session = this.loadSession(sessionId, sessionDir);

      if (session) {
        const isNew = !this.sessions.has(sessionId);
        this.sessions.set(sessionId, session);
        const summary = this.toSummary(session);
        summaries.push(summary);

        if (isNew) {
          this.callbacks.onSessionAdded?.(summary);
        }
      }
    }

    // Detect removed sessions
    for (const [id] of this.sessions) {
      if (!currentIds.has(id)) {
        this.sessions.delete(id);
        clearParserCache(path.join(this.basePath, id, 'events.jsonl'));
        this.callbacks.onSessionRemoved?.(id);
      }
    }

    return summaries;
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
        oldSession.toolCallCount !== session.toolCallCount)) {
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

  getPrompts(sessionId: string, limit = 20): string[] {
    const eventsPath = path.join(this.basePath, sessionId, 'events.jsonl');
    return extractCopilotPrompts(eventsPath, limit);
  }

  handleEventsChanged(sessionId: string): void {
    this.refreshSession(sessionId);
  }

  handleNewSession(sessionId: string): void {
    const sessionDir = path.join(this.basePath, sessionId);
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
  }

  dispose(): void {
    this.sessions.clear();
  }

  private loadSession(id: string, sessionDir: string): CopilotSession | null {
    const workspace = this.parseWorkspace(sessionDir);
    const eventsPath = path.join(sessionDir, 'events.jsonl');

    const parsed = fs.existsSync(eventsPath) ? parseSessionEvents(eventsPath) : null;

    return {
      id,
      status: parsed?.status ?? 'idle',
      workspace,
      messageCount: parsed?.messageCount ?? 0,
      toolCallCount: parsed?.toolCallCount ?? 0,
      lastActivityTime: parsed?.lastActivityTime ?? 0,
      timeline: parsed?.timeline ?? [],
      pendingToolCalls: parsed?.pendingToolCalls ?? 0,
      totalTokens: parsed?.totalTokens ?? 0,
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

      for (const line of content.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim().toLowerCase();
        // Handle values that may contain colons (e.g. timestamps, URLs)
        const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

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
