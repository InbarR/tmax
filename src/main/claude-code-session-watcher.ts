import * as fs from 'node:fs';
import * as path from 'node:path';
import * as chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { canUseNativeRecursiveWatch } from './utils/fsevents';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export interface ClaudeCodeWatcherCallbacks {
  onFileChanged: (filePath: string) => void;
  onNewFile: (filePath: string) => void;
  onFileRemoved: (filePath: string) => void;
}

// TASK-157 — see copilot-session-watcher.ts for the full rationale. Short
// version: the original `usePolling: true, interval: 1000` against a glob
// like `~/.claude/projects/*/*.jsonl` stat()'d every matched file once per
// second. With many old sessions on disk this dominated idle CPU. We now use:
//
//   Tier A — Native chokidar on the parent dir (depth 2), no per-file polling.
//   Tier B — Self-managed 1s mtime poll over a small hot set (files seen via
//     tier A in the last HOT_WINDOW_MS). Entries auto-expire.
//   Tier C — Existing 10s stale-check sweep re-promotes cold→hot transitions.
//
// WSL share paths fall back to the original full-glob polling because native
// watching across `\\wsl.localhost\` isn't reliable.

const HOT_POLL_INTERVAL_MS = 1000;
// Claude Code sessions can have longer gaps between turns than Copilot CLI
// (planning, long reads). Use the same 5-minute window — beyond that, the
// 10s stale sweep will catch reactivation.
const HOT_WINDOW_MS = 5 * 60 * 1000;

function isWslSharePath(p: string): boolean {
  const norm = p.replace(/\\/g, '/').toLowerCase();
  return norm.startsWith('//wsl.localhost/') || norm.startsWith('//wsl$/');
}

export class ClaudeCodeSessionWatcher {
  private watcher: FSWatcher | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private hotPollTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: ClaudeCodeWatcherCallbacks;
  private basePath: string;
  private knownFiles = new Set<string>();
  /** filePath → last observed mtimeMs. Only contains files in the hot window. */
  private hotFiles = new Map<string, number>();
  private onStaleCheck: (() => void) | null = null;
  private readonly isWslShare: boolean;

  constructor(basePath: string, callbacks: ClaudeCodeWatcherCallbacks) {
    this.basePath = basePath;
    this.callbacks = callbacks;
    this.isWslShare = isWslSharePath(basePath);
  }

  setStaleCheckCallback(cb: () => void): void {
    this.onStaleCheck = cb;
  }

  async start(): Promise<void> {
    if (this.watcher) {
      // Guard against repeated start() calls (renderer remounts in dev mode,
      // post-restoreSession, packaged-build belt-and-braces auto-start).
      return;
    }

    if (this.isWslShare) {
      await this.startWslPollingFallback();
    } else {
      // Seed knownFiles from disk once at startup. With ignoreInitial: true
      // chokidar won't emit 'add' for pre-existing files, so tier C would
      // otherwise have an empty set to sweep over and miss cold→hot
      // transitions of long-dormant sessions.
      this.seedKnownFilesFromDisk();
      await this.startNativeWithHotPoll();
    }

    this.staleTimer = setInterval(() => {
      this.sweepKnownFilesForReactivation();
      this.onStaleCheck?.();
    }, 10_000);
  }

  private seedKnownFilesFromDisk(): void {
    let projectDirs: fs.Dirent[];
    try {
      projectDirs = fs.readdirSync(this.basePath, { withFileTypes: true });
    } catch {
      return;
    }
    const cutoff = Date.now() - HOT_WINDOW_MS;
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
        const norm = filePath.replace(/\\/g, '/');
        this.knownFiles.add(norm);
        // Seed an initial mtime baseline for files inside the hot window so
        // the first tier-C sweep doesn't treat their existing mtime as a
        // fresh "cold-to-hot" transition. Without this, every session
        // last touched in the past HOT_WINDOW_MS fires a spurious
        // onFileChanged at boot, which floods notifications for sessions
        // that were already in waiting state.
        try {
          const mtime = fs.statSync(filePath).mtimeMs;
          if (mtime > cutoff) this.hotFiles.set(filePath, mtime);
        } catch { /* missing file - chokidar will sort it out */ }
      }
    }
  }

  private async startNativeWithHotPoll(): Promise<void> {
    // See copilot-session-watcher.ts / utils/fsevents.ts: a non-polling
    // recursive watch on macOS without fsevents opens one fd per dir and
    // exhausts the descriptor limit (EMFILE). Fall back to bounded polling.
    const nativeSafe = canUseNativeRecursiveWatch();
    console.log(`[claude-code-watcher] start() basePath=${this.basePath} mode=native+hotpoll usePolling=${!nativeSafe}`);
    if (!nativeSafe) {
      console.warn('[claude-code-watcher] fsevents unavailable — using bounded polling to avoid fd exhaustion (EMFILE)');
    }

    try {
      this.watcher = chokidar.watch(this.basePath, {
        usePolling: !nativeSafe,
        // Depth 2: ~/.claude/projects/<projectDir>/<sessionUUID>.jsonl
        depth: 2,
        ignoreInitial: true,
        persistent: true,
        ignored: (p: string) => {
          if (p === this.basePath) return false;
          const rel = path.relative(this.basePath, p);
          if (!rel || rel === '.' || rel.includes('..')) return false;
          const segs = rel.split(/[\\/]/);
          // Allow top-level project dirs.
          if (segs.length === 1) return false;
          // At depth 2: must be a UUID-named .jsonl.
          if (segs.length === 2) return !UUID_RE.test(segs[1]);
          return true;
        },
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 150,
        },
      });
    } catch (err) {
      console.error(`[claude-code-watcher] chokidar.watch failed:`, err);
      throw err;
    }
    this.wireWatcherEvents();

    this.hotPollTimer = setInterval(() => {
      this.pollHotFiles();
    }, HOT_POLL_INTERVAL_MS);
  }

  private async startWslPollingFallback(): Promise<void> {
    const glob = path.join(this.basePath, '*', '*.jsonl').replace(/\\/g, '/');
    console.log(`[claude-code-watcher] start() basePath=${this.basePath} mode=wsl-polling glob=${glob}`);

    try {
      this.watcher = chokidar.watch(glob, {
        usePolling: true,
        interval: 1000,
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 150,
        },
      });
    } catch (err) {
      console.error(`[claude-code-watcher] chokidar.watch failed:`, err);
      throw err;
    }
    this.wireWatcherEvents();
  }

  private wireWatcherEvents(): void {
    if (!this.watcher) return;

    this.watcher.on('error', (err) => {
      console.error(`[claude-code-watcher] error event:`, err);
    });
    this.watcher.on('ready', () => {
      console.log(`[claude-code-watcher] ready - watching ${this.basePath}`);
    });

    this.watcher.on('add', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      const norm = filePath.replace(/\\/g, '/');
      this.markHot(filePath);
      if (!this.knownFiles.has(norm)) {
        this.knownFiles.add(norm);
        this.callbacks.onNewFile(filePath);
      }
    });

    this.watcher.on('change', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      this.markHot(filePath);
      this.callbacks.onFileChanged(filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      const norm = filePath.replace(/\\/g, '/');
      this.hotFiles.delete(filePath);
      this.knownFiles.delete(norm);
      this.callbacks.onFileRemoved(filePath);
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

  private pollHotFiles(): void {
    if (this.hotFiles.size === 0) return;
    const now = Date.now();
    const cutoff = now - HOT_WINDOW_MS;

    for (const [filePath, lastMtime] of this.hotFiles) {
      let mtime: number;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch {
        this.hotFiles.delete(filePath);
        continue;
      }

      if (mtime > lastMtime) {
        this.hotFiles.set(filePath, mtime);
        this.callbacks.onFileChanged(filePath);
      } else if (mtime < cutoff) {
        this.hotFiles.delete(filePath);
      }
    }
  }

  /**
   * Tier C helper: re-stat every known session file and re-promote any whose
   * mtime advanced past the last known value. Catches cold→hot transitions
   * that tier A would miss on Windows (chokidar's native 'change' for files
   * inside watched dirs isn't 100% reliable).
   *
   * Cost: O(known-session-count) stat() calls every 10s. For a user with
   * 1000 sessions that's ~100 stats/s — a 10× reduction vs the original
   * full-glob 1s polling.
   */
  private sweepKnownFilesForReactivation(): void {
    if (this.isWslShare) return;
    const cutoff = Date.now() - HOT_WINDOW_MS;
    for (const norm of this.knownFiles) {
      const filePath = path.normalize(norm);
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
        this.callbacks.onFileChanged(filePath);
      } else if (mtime > known) {
        this.hotFiles.set(filePath, mtime);
        this.callbacks.onFileChanged(filePath);
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
    this.knownFiles.clear();
    this.hotFiles.clear();
  }

  private isSessionFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return UUID_RE.test(basename);
  }
}
