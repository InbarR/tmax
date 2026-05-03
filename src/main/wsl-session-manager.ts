import { ClaudeCodeSessionMonitor } from './claude-code-session-monitor';
import { ClaudeCodeSessionWatcher } from './claude-code-session-watcher';
import { CopilotSessionMonitor } from './copilot-session-monitor';
import { CopilotSessionWatcher } from './copilot-session-watcher';
import { getWslDistroInfo, isWslAvailable } from './wsl-utils';
import type { CopilotSessionSummary } from '../shared/copilot-types';

export interface WslSessionCallbacks {
  onCopilotSessionUpdated?: (session: CopilotSessionSummary) => void;
  onCopilotSessionAdded?: (session: CopilotSessionSummary) => void;
  onCopilotSessionRemoved?: (sessionId: string) => void;
  onClaudeCodeSessionUpdated?: (session: CopilotSessionSummary) => void;
  onClaudeCodeSessionAdded?: (session: CopilotSessionSummary) => void;
  onClaudeCodeSessionRemoved?: (sessionId: string) => void;
}

interface DistroPair {
  distro: string;
  copilotMonitor: CopilotSessionMonitor;
  copilotWatcher: CopilotSessionWatcher;
  claudeMonitor: ClaudeCodeSessionMonitor;
  claudeWatcher: ClaudeCodeSessionWatcher;
}

/**
 * Manages session monitors/watchers for all detected WSL distros.
 * Only active on Windows when WSL is available.
 */
export class WslSessionManager {
  private pairs: DistroPair[] = [];
  private callbacks: WslSessionCallbacks = {};

  setCallbacks(callbacks: WslSessionCallbacks): void {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (!isWslAvailable()) return;

    const distros = await getWslDistroInfo();

    for (const distro of distros) {
      const copilotMonitor = new CopilotSessionMonitor({
        basePath: distro.copilotBasePath,
        wslDistro: distro.name,
      });
      copilotMonitor.setCallbacks({
        onSessionUpdated: (s) => this.callbacks.onCopilotSessionUpdated?.(s),
        onSessionAdded: (s) => this.callbacks.onCopilotSessionAdded?.(s),
        onSessionRemoved: (id) => this.callbacks.onCopilotSessionRemoved?.(id),
      });

      const copilotWatcher = new CopilotSessionWatcher(distro.copilotBasePath, {
        onEventsChanged: (id) => copilotMonitor.handleEventsChanged(id),
        onNewSession: (id) => copilotMonitor.handleNewSession(id),
        onSessionRemoved: (id) => copilotMonitor.handleSessionRemoved(id),
      });
      copilotWatcher.setStaleCheckCallback(() => copilotMonitor.refreshLoadedSessions());

      const claudeMonitor = new ClaudeCodeSessionMonitor({
        basePath: distro.claudeBasePath,
        wslDistro: distro.name,
      });
      claudeMonitor.setCallbacks({
        onSessionUpdated: (s) => this.callbacks.onClaudeCodeSessionUpdated?.(s),
        onSessionAdded: (s) => this.callbacks.onClaudeCodeSessionAdded?.(s),
        onSessionRemoved: (id) => this.callbacks.onClaudeCodeSessionRemoved?.(id),
      });

      const claudeWatcher = new ClaudeCodeSessionWatcher(distro.claudeBasePath, {
        onFileChanged: (fp) => claudeMonitor.handleFileChanged(fp),
        onNewFile: (fp) => claudeMonitor.handleNewFile(fp),
        onFileRemoved: (fp) => claudeMonitor.handleFileRemoved(fp),
      });
      claudeWatcher.setStaleCheckCallback(() => claudeMonitor.refreshLoadedSessions());

      this.pairs.push({
        distro: distro.name,
        copilotMonitor,
        copilotWatcher,
        claudeMonitor,
        claudeWatcher,
      });
    }

    // Start all watchers — isolate per-distro so one failure doesn't block others
    for (const pair of this.pairs) {
      try {
        await pair.copilotWatcher.start();
        await pair.claudeWatcher.start();
      } catch (err) {
        console.error(`WSL watcher failed for distro ${pair.distro}:`, err);
      }
    }

    // Perform initial scan to discover existing sessions
    // (watchers use ignoreInitial: true, so won't detect pre-existing files)
    for (const pair of this.pairs) {
      try {
        await pair.copilotMonitor.scanSessions();
        await pair.claudeMonitor.scanSessions();
      } catch (err) {
        console.error(`WSL scan failed for distro ${pair.distro}:`, err);
      }
    }
  }

  async scanCopilotSessions(): Promise<CopilotSessionSummary[]> {
    const results: CopilotSessionSummary[] = [];
    for (const pair of this.pairs) {
      results.push(...await pair.copilotMonitor.scanSessions());
    }
    return results;
  }

  async scanClaudeCodeSessions(): Promise<CopilotSessionSummary[]> {
    const results: CopilotSessionSummary[] = [];
    for (const pair of this.pairs) {
      results.push(...await pair.claudeMonitor.scanSessions());
    }
    return results;
  }

  getCopilotSession(id: string): ReturnType<CopilotSessionMonitor['getSession']> {
    for (const pair of this.pairs) {
      const session = pair.copilotMonitor.getSession(id);
      if (session) return session;
    }
    return null;
  }

  getClaudeCodeSession(id: string): CopilotSessionSummary | null {
    for (const pair of this.pairs) {
      const session = pair.claudeMonitor.getSession(id);
      if (session) return session;
    }
    return null;
  }

  searchCopilotSessions(query: string): CopilotSessionSummary[] {
    const results: CopilotSessionSummary[] = [];
    for (const pair of this.pairs) {
      results.push(...pair.copilotMonitor.searchSessions(query));
    }
    return results;
  }

  searchClaudeCodeSessions(query: string): CopilotSessionSummary[] {
    const results: CopilotSessionSummary[] = [];
    for (const pair of this.pairs) {
      results.push(...pair.claudeMonitor.searchSessions(query));
    }
    return results;
  }

  getCopilotPrompts(sessionId: string, limit?: number): string[] {
    for (const pair of this.pairs) {
      const session = pair.copilotMonitor.getSession(sessionId);
      if (session) return pair.copilotMonitor.getPrompts(sessionId, limit);
    }
    return [];
  }

  getClaudeCodePrompts(sessionId: string, limit?: number): string[] {
    for (const pair of this.pairs) {
      const session = pair.claudeMonitor.getSession(sessionId);
      if (session) return pair.claudeMonitor.getPrompts(sessionId, limit);
    }
    return [];
  }

  async stop(): Promise<void> {
    for (const pair of this.pairs) {
      await pair.copilotWatcher.stop();
      await pair.claudeWatcher.stop();
      pair.copilotMonitor.dispose();
      pair.claudeMonitor.dispose();
    }
    this.pairs = [];
  }
}
