import * as path from 'node:path';
import * as chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

export interface CopilotWatcherCallbacks {
  onEventsChanged: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
  onSessionRemoved: (sessionId: string) => void;
}

export class CopilotSessionWatcher {
  private watcher: FSWatcher | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: CopilotWatcherCallbacks;
  private basePath: string;
  private knownSessions = new Set<string>();
  private onStaleCheck: (() => void) | null = null;

  constructor(basePath: string, callbacks: CopilotWatcherCallbacks) {
    this.basePath = basePath;
    this.callbacks = callbacks;
  }

  setStaleCheckCallback(cb: () => void): void {
    this.onStaleCheck = cb;
  }

  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    const eventsGlob = path.join(this.basePath, '*', 'events.jsonl').replace(/\\/g, '/');
    const workspaceGlob = path.join(this.basePath, '*', 'workspace.yaml').replace(/\\/g, '/');

    console.log(`[copilot-watcher] start() basePath=${this.basePath} globs=[${eventsGlob}, ${workspaceGlob}]`);

    try {
      this.watcher = chokidar.watch([eventsGlob, workspaceGlob], {
        usePolling: true,
        interval: 500,
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });
    } catch (err) {
      console.error(`[copilot-watcher] chokidar.watch failed:`, err);
      throw err;
    }
    this.watcher.on('error', (err) => {
      console.error(`[copilot-watcher] error event:`, err);
    });
    this.watcher.on('ready', () => {
      console.log(`[copilot-watcher] ready - watching ${this.basePath}`);
    });

    this.watcher.on('add', (filePath: string) => {
      const sessionId = this.extractSessionId(filePath);
      if (!sessionId) return;

      if (!this.knownSessions.has(sessionId)) {
        this.knownSessions.add(sessionId);
        this.callbacks.onNewSession(sessionId);
      }

      if (filePath.endsWith('events.jsonl')) {
        this.callbacks.onEventsChanged(sessionId);
      }
    });

    this.watcher.on('change', (filePath: string) => {
      const sessionId = this.extractSessionId(filePath);
      if (!sessionId) return;

      if (filePath.endsWith('events.jsonl') || filePath.endsWith('workspace.yaml')) {
        this.callbacks.onEventsChanged(sessionId);
      }
    });

    this.watcher.on('unlink', (filePath: string) => {
      const sessionId = this.extractSessionId(filePath);
      if (!sessionId) return;

      if (filePath.endsWith('events.jsonl')) {
        this.knownSessions.delete(sessionId);
        this.callbacks.onSessionRemoved(sessionId);
      }
    });

    // Status timer to detect stale "thinking" sessions.
    // Only refreshes already-loaded sessions (no directory scan), so safe at 10s.
    this.staleTimer = setInterval(() => {
      this.onStaleCheck?.();
    }, 10_000);
  }

  async stop(): Promise<void> {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.knownSessions.clear();
  }

  private extractSessionId(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    const baseParts = this.basePath.replace(/\\/g, '/').replace(/\/$/, '');
    const relative = normalized.replace(baseParts + '/', '');
    const parts = relative.split('/');
    return parts.length >= 2 ? parts[0] : null;
  }
}
