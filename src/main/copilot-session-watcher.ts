import * as fs from 'node:fs';
import * as path from 'node:path';
import * as chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { canUseNativeRecursiveWatch } from './utils/fsevents';

export interface CopilotWatcherCallbacks {
  onEventsChanged: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
  onSessionRemoved: (sessionId: string) => void;
}

// TASK-157 — Polling tax explained
// ─────────────────────────────────
// The original implementation watched a glob like `~/.copilot/*/events.jsonl`
// with `usePolling: true, interval: 500`. With hundreds of session files on
// disk (common for long-time users) that meant chokidar stat()'d every matched
// file twice a second forever, costing ~4-6% idle CPU per tmax instance.
//
// We can't drop polling outright: chokidar's native watcher has historically
// been unreliable for append-only writes to JSONL files on Windows, and
// completely unreliable across `\\wsl.localhost\` network shares (see
// wsl-session-manager.ts). So we use a hybrid:
//
//   Tier A — Native chokidar on the parent directory only (no per-file
//     polling). Catches add/unlink/change events cheaply. Idle cost: ~0%.
//   Tier B — A self-managed 1s mtime poll over a small "hot" set (files seen
//     via tier A in the last HOT_WINDOW_MS). Entries auto-expire when their
//     mtime stops advancing, so the hot set stays tiny on an idle machine.
//   Tier C — Existing 10s stale-check tick (refreshLoadedSessions on the
//     monitor) augmented to also re-stat every loaded session and re-promote
//     any whose mtime advanced. Covers the cold→hot transition when a
//     long-dormant session resumes activity.
//
// WSL paths fall back to the old all-polling behavior because native watching
// across `\\wsl.localhost\` isn't reliable enough to trust for `add`/`change`.

const HOT_POLL_INTERVAL_MS = 1000;
// A file is "hot" for HOT_WINDOW_MS after its last observed mtime bump. The
// 5-minute window covers Copilot CLI's typical between-prompt idle gap without
// dropping the session out of the hot set during normal back-and-forth use.
const HOT_WINDOW_MS = 5 * 60 * 1000;

function isWslSharePath(p: string): boolean {
  const norm = p.replace(/\\/g, '/').toLowerCase();
  return norm.startsWith('//wsl.localhost/') || norm.startsWith('//wsl$/');
}

export class CopilotSessionWatcher {
  private watcher: FSWatcher | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private hotPollTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: CopilotWatcherCallbacks;
  private basePath: string;
  private knownSessions = new Set<string>();
  /** filePath → last observed mtimeMs. Only contains files in the hot window. */
  private hotFiles = new Map<string, number>();
  private onStaleCheck: (() => void) | null = null;
  private readonly isWslShare: boolean;

  constructor(basePath: string, callbacks: CopilotWatcherCallbacks) {
    this.basePath = basePath;
    this.callbacks = callbacks;
    this.isWslShare = isWslSharePath(basePath);
  }

  setStaleCheckCallback(cb: () => void): void {
    this.onStaleCheck = cb;
  }

  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    if (this.isWslShare) {
      await this.startWslPollingFallback();
    } else {
      // Seed knownSessions from disk once at startup. With ignoreInitial: true
      // chokidar won't emit 'add' for pre-existing sessions, so tier C would
      // otherwise have an empty set to sweep over and miss cold→hot
      // transitions of long-dormant sessions.
      this.seedKnownSessionsFromDisk();
      await this.startNativeWithHotPoll();
    }

    // Status timer to detect stale "thinking" sessions plus a cheap mtime
    // re-stat sweep that catches cold→hot transitions tier A would miss
    // (e.g. a long-dormant session resuming activity).
    this.staleTimer = setInterval(() => {
      this.sweepLoadedSessionsForReactivation();
      this.onStaleCheck?.();
    }, 10_000);
  }

  private seedKnownSessionsFromDisk(): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.basePath, { withFileTypes: true });
    } catch {
      return;
    }
    const cutoff = Date.now() - HOT_WINDOW_MS;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      this.knownSessions.add(entry.name);
      // Seed an initial mtime baseline for events.jsonl inside the hot
      // window so the first tier-C sweep doesn't treat its existing mtime
      // as a fresh "cold-to-hot" transition. Without this, every session
      // touched in the past HOT_WINDOW_MS fires a spurious onEventsChanged
      // at boot, which floods notifications for sessions already in
      // waiting state.
      const filePath = path.join(this.basePath, entry.name, 'events.jsonl');
      try {
        const mtime = fs.statSync(filePath).mtimeMs;
        if (mtime > cutoff) this.hotFiles.set(filePath, mtime);
      } catch { /* events.jsonl may not exist yet */ }
    }
  }

  /**
   * Native-watch path used on local Windows / macOS / Linux filesystems. Cheap
   * directory-level watch plus a tiny per-file mtime poll over the hot set.
   */
  private async startNativeWithHotPoll(): Promise<void> {
    // On macOS, a non-polling recursive watch is only safe when fsevents loads
    // (single FSEvents watcher). Without it, chokidar opens one fs.watch fd per
    // session dir and exhausts the descriptor limit (EMFILE) on accounts with
    // thousands of sessions, wedging startup. Fall back to bounded stat-polling
    // (no persistent fds) in that case. See utils/fsevents.ts for the full
    // rationale. After the packaging fix bundles fsevents this fallback should
    // never trigger on macOS.
    const nativeSafe = canUseNativeRecursiveWatch();
    console.log(`[copilot-watcher] start() basePath=${this.basePath} mode=native+hotpoll usePolling=${!nativeSafe}`);
    if (!nativeSafe) {
      console.warn('[copilot-watcher] fsevents unavailable — using bounded polling to avoid fd exhaustion (EMFILE)');
    }

    try {
      this.watcher = chokidar.watch(this.basePath, {
        usePolling: !nativeSafe,
        // Depth 2 covers ~/.copilot/<sessionId>/(events.jsonl|workspace.yaml).
        // chokidar's depth counts recursion levels; depth: 2 is generous and
        // keeps us from accidentally missing files if Copilot CLI ever puts a
        // session under an extra subdir.
        depth: 2,
        ignoreInitial: true,
        persistent: true,
        // Filter at the chokidar level so we don't get spammed by sibling
        // files Copilot CLI also writes into the session dir (locks, tmp).
        ignored: (p: string) => {
          // Always allow the base dir and immediate subdirs.
          if (p === this.basePath) return false;
          const rel = path.relative(this.basePath, p);
          if (!rel || rel === '.' || rel.includes('..')) return false;
          // First segment is the session dir; allow it.
          const segs = rel.split(/[\\/]/);
          if (segs.length === 1) return false;
          // Second segment must be one of the files we care about.
          const leaf = segs[segs.length - 1];
          return leaf !== 'events.jsonl' && leaf !== 'workspace.yaml';
        },
        // awaitWriteFinish debounces partial JSONL appends. The brief polling
        // here is bounded to active-write bursts only — not an idle cost.
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });
    } catch (err) {
      console.error(`[copilot-watcher] chokidar.watch failed:`, err);
      throw err;
    }
    this.wireWatcherEvents();

    this.hotPollTimer = setInterval(() => {
      this.pollHotFiles();
    }, HOT_POLL_INTERVAL_MS);
  }

  /**
   * WSL fallback: native watching across `\\wsl.localhost\<distro>\` shares is
   * unreliable, so we keep the original full-glob polling behavior. The 500ms
   * interval there matches what users on this code path were already paying.
   */
  private async startWslPollingFallback(): Promise<void> {
    const eventsGlob = path.join(this.basePath, '*', 'events.jsonl').replace(/\\/g, '/');
    const workspaceGlob = path.join(this.basePath, '*', 'workspace.yaml').replace(/\\/g, '/');

    console.log(`[copilot-watcher] start() basePath=${this.basePath} mode=wsl-polling globs=[${eventsGlob}, ${workspaceGlob}]`);

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
    this.wireWatcherEvents();
  }

  private wireWatcherEvents(): void {
    if (!this.watcher) return;

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
        this.markHot(filePath);
        this.callbacks.onEventsChanged(sessionId);
      } else if (filePath.endsWith('workspace.yaml')) {
        this.markHot(filePath);
      }
    });

    this.watcher.on('change', (filePath: string) => {
      const sessionId = this.extractSessionId(filePath);
      if (!sessionId) return;

      if (filePath.endsWith('events.jsonl') || filePath.endsWith('workspace.yaml')) {
        this.markHot(filePath);
        this.callbacks.onEventsChanged(sessionId);
      }
    });

    this.watcher.on('unlink', (filePath: string) => {
      const sessionId = this.extractSessionId(filePath);
      if (!sessionId) return;

      this.hotFiles.delete(filePath);

      if (filePath.endsWith('events.jsonl')) {
        this.knownSessions.delete(sessionId);
        this.callbacks.onSessionRemoved(sessionId);
      }
    });
  }

  private markHot(filePath: string): void {
    try {
      const mtime = fs.statSync(filePath).mtimeMs;
      this.hotFiles.set(filePath, mtime);
    } catch {
      this.hotFiles.delete(filePath);
    }
  }

  /**
   * Tier B: stat only the small hot set. Fires onEventsChanged when mtime
   * advances beyond what we last saw. Drops entries whose mtime has been
   * stable past HOT_WINDOW_MS so the hot set stays bounded by the user's
   * actually-active sessions (typically 0-15) rather than total sessions
   * on disk (potentially thousands).
   */
  private pollHotFiles(): void {
    if (this.hotFiles.size === 0) return;
    const now = Date.now();
    const cutoff = now - HOT_WINDOW_MS;

    for (const [filePath, lastMtime] of this.hotFiles) {
      let mtime: number;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch {
        // File vanished — let the chokidar unlink handler clean up state.
        this.hotFiles.delete(filePath);
        continue;
      }

      if (mtime > lastMtime) {
        this.hotFiles.set(filePath, mtime);
        const sessionId = this.extractSessionId(filePath);
        if (sessionId && (filePath.endsWith('events.jsonl') || filePath.endsWith('workspace.yaml'))) {
          this.callbacks.onEventsChanged(sessionId);
        }
      } else if (mtime < cutoff) {
        // Dormant — drop from hot set. Tier C (10s stale sweep) will
        // re-promote if the file gets written again.
        this.hotFiles.delete(filePath);
      }
    }
  }

  /**
   * Tier C helper: re-stat the events.jsonl of every known session and
   * re-promote any whose mtime advanced past the last known value. This
   * catches cold→hot transitions that tier A would miss on Windows, where
   * chokidar's native 'change' event for files inside watched dirs is not
   * 100% reliable.
   *
   * Cost: O(known-session-count) stat() calls every 10s. For a user with
   * 1000 sessions that's ~100 stats/s — a 40× reduction vs the original
   * full-glob polling at 500ms. We only stat events.jsonl (workspace.yaml
   * is rare-write, caught by native add/change), keeping the sweep tight.
   */
  private sweepLoadedSessionsForReactivation(): void {
    if (this.isWslShare) return; // WSL path is already all-polling
    const cutoff = Date.now() - HOT_WINDOW_MS;
    for (const sessionId of this.knownSessions) {
      const filePath = path.join(this.basePath, sessionId, 'events.jsonl');
      let mtime: number;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      if (mtime < cutoff) {
        this.hotFiles.delete(filePath);
        continue;
      }
      const known = this.hotFiles.get(filePath);
      if (known === undefined) {
        this.hotFiles.set(filePath, mtime);
        this.callbacks.onEventsChanged(sessionId);
      } else if (mtime > known) {
        this.hotFiles.set(filePath, mtime);
        this.callbacks.onEventsChanged(sessionId);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.hotPollTimer) {
      clearInterval(this.hotPollTimer);
      this.hotPollTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.knownSessions.clear();
    this.hotFiles.clear();
  }

  private extractSessionId(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    const baseParts = this.basePath.replace(/\\/g, '/').replace(/\/$/, '');
    const relative = normalized.replace(baseParts + '/', '');
    const parts = relative.split('/');
    return parts.length >= 2 ? parts[0] : null;
  }
}
