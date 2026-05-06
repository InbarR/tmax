import type { AgentProvider, PaneInfo, PaneRegistryAPI } from './types';
import { paneBufferStore } from './buffer-store';

/**
 * Pane registry — main-process source of truth that the MCP server consults
 * to enumerate panes and resolve agent metadata.
 *
 * Renderer pushes lightweight PaneSnapshots over IPC every time the terminal
 * store changes (title, cwd, lastProcess, aiSessionId). Pane lifetime is
 * driven by `register` / `unregister` calls from `pty-manager` lifecycle
 * hooks (so the registry stays accurate even if the renderer is detached).
 *
 * `provider` and `aiSessionId` are filled in two ways:
 *  1. The renderer's terminal store may know the pane's aiSessionId because
 *     the pane was launched via "Open AI Session". That hint is forwarded
 *     here on every `update`.
 *  2. The Copilot / Claude session monitors discover sessions on disk and
 *     can match by cwd if no explicit hint was provided (rough heuristic).
 */
export interface PaneSnapshot {
  id: string;
  title?: string;
  cwd?: string;
  lastProcess?: string;
  aiSessionId?: string;
  /** When the renderer can identify the agent provider explicitly. */
  provider?: AgentProvider;
  wsl?: boolean;
  wslDistro?: string;
}

interface InternalPane {
  id: string;
  title: string;
  cwd: string;
  pid: number;
  lastProcess?: string;
  aiSessionId?: string;
  provider?: AgentProvider;
  wsl?: boolean;
  wslDistro?: string;
}

class PaneRegistry implements PaneRegistryAPI {
  private panes = new Map<string, InternalPane>();
  private listeners = new Set<() => void>();

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Called by pty-manager when a PTY is created. */
  register(paneId: string, pid: number, cwd: string): void {
    const existing = this.panes.get(paneId);
    if (existing) {
      // Intentional: a pane that re-registers (e.g. shell respawn after
      // exit) keeps its title / aiSessionId / provider — those came from
      // the renderer side and didn't disappear with the shell. Only the
      // pid + cwd are PTY-instance-specific.
      existing.pid = pid;
      existing.cwd = cwd || existing.cwd;
    } else {
      this.panes.set(paneId, {
        id: paneId,
        title: paneId,
        cwd,
        pid,
      });
    }
    this.notify();
  }

  /** Called by pty-manager when a PTY exits. Cleans buffer too. */
  unregister(paneId: string): void {
    if (this.panes.delete(paneId)) {
      paneBufferStore.drop(paneId);
      this.notify();
    }
  }

  /** Renderer-driven update: title, cwd, ai session, etc. */
  update(snapshot: PaneSnapshot): void {
    const existing = this.panes.get(snapshot.id);
    if (!existing) {
      // Create a stub if the renderer reports a pane we haven't seen yet
      // (e.g. session restore beats pty-manager.register).
      this.panes.set(snapshot.id, {
        id: snapshot.id,
        title: snapshot.title ?? snapshot.id,
        cwd: snapshot.cwd ?? '',
        pid: 0,
        lastProcess: snapshot.lastProcess,
        aiSessionId: snapshot.aiSessionId,
        provider: snapshot.provider,
        wsl: snapshot.wsl,
        wslDistro: snapshot.wslDistro,
      });
    } else {
      if (snapshot.title !== undefined) existing.title = snapshot.title;
      if (snapshot.cwd !== undefined) existing.cwd = snapshot.cwd;
      if (snapshot.lastProcess !== undefined) existing.lastProcess = snapshot.lastProcess;
      if (snapshot.aiSessionId !== undefined) existing.aiSessionId = snapshot.aiSessionId;
      if (snapshot.provider !== undefined) existing.provider = snapshot.provider;
      if (snapshot.wsl !== undefined) existing.wsl = snapshot.wsl;
      if (snapshot.wslDistro !== undefined) existing.wslDistro = snapshot.wslDistro;
    }
    this.notify();
  }

  list(): PaneInfo[] {
    return Array.from(this.panes.values()).map((p) => this.toInfo(p));
  }

  get(paneId: string): PaneInfo | undefined {
    const p = this.panes.get(paneId);
    return p ? this.toInfo(p) : undefined;
  }

  /**
   * Force-set provider/aiSessionId from an out-of-band detector (e.g. the
   * Copilot session monitor matching by cwd). Called rarely.
   */
  setAgentBinding(paneId: string, provider: AgentProvider, aiSessionId: string): void {
    const p = this.panes.get(paneId);
    if (!p) return;
    if (p.provider === provider && p.aiSessionId === aiSessionId) return;
    p.provider = provider;
    p.aiSessionId = aiSessionId;
    this.notify();
  }

  private toInfo(p: InternalPane): PaneInfo {
    const bufMeta = paneBufferStore.getMeta(p.id);
    return {
      id: p.id,
      title: p.title,
      cwd: p.cwd,
      pid: p.pid,
      isAgent: !!(p.provider && p.aiSessionId),
      provider: p.provider,
      aiSessionId: p.aiSessionId,
      lastProcess: p.lastProcess,
      lastActivityTime: bufMeta.lastActivityTime || undefined,
      lastExitCode: bufMeta.lastExitCode,
      wsl: p.wsl,
      wslDistro: p.wslDistro,
    };
  }

  clear(): void {
    if (this.panes.size === 0) return;
    this.panes.clear();
    this.notify();
  }
}

export const paneRegistry = new PaneRegistry();
export { PaneRegistry };
