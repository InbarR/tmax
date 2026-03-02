import * as path from 'node:path';
import type { FSWatcher } from 'chokidar';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export interface ClaudeCodeWatcherCallbacks {
  onFileChanged: (filePath: string) => void;
  onNewFile: (filePath: string) => void;
  onFileRemoved: (filePath: string) => void;
}

export class ClaudeCodeSessionWatcher {
  private watcher: FSWatcher | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: ClaudeCodeWatcherCallbacks;
  private basePath: string;
  private knownFiles = new Set<string>();
  private onStaleCheck: (() => void) | null = null;

  constructor(basePath: string, callbacks: ClaudeCodeWatcherCallbacks) {
    this.basePath = basePath;
    this.callbacks = callbacks;
  }

  setStaleCheckCallback(cb: () => void): void {
    this.onStaleCheck = cb;
  }

  async start(): Promise<void> {
    const chokidar = await import('chokidar');

    // Watch all JSONL files one level deep under project directories
    const glob = path
      .join(this.basePath, '*', '*.jsonl')
      .replace(/\\/g, '/');

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

    this.watcher.on('add', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      const norm = filePath.replace(/\\/g, '/');
      if (!this.knownFiles.has(norm)) {
        this.knownFiles.add(norm);
        this.callbacks.onNewFile(filePath);
      }
    });

    this.watcher.on('change', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      this.callbacks.onFileChanged(filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      if (!this.isSessionFile(filePath)) return;
      const norm = filePath.replace(/\\/g, '/');
      this.knownFiles.delete(norm);
      this.callbacks.onFileRemoved(filePath);
    });

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
    this.knownFiles.clear();
  }

  private isSessionFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return UUID_RE.test(basename);
  }
}
