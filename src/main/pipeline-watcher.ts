/**
 * PipelineWatcher — watches ~/.tmax/pipeline/ for status JSON files written
 * by the tmax-pipeline-monitor background script. Sends IPC updates to the
 * renderer so the PipelineFooter widget can display live progress.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/ipc-channels';
import type { PipelineStatus } from '../shared/pipeline-types';
import { diagLog } from './diag-logger';

// Strict pane ID validation: UUIDs only (no path traversal)
const VALID_PANE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PipelineWatcher {
  private dir: string;
  private watcher: fs.FSWatcher | null = null;
  private lastStatus = new Map<string, string>();
  private rescanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private getWindow: () => BrowserWindow | null) {
    this.dir = path.join(app.getPath('home'), '.tmax', 'pipeline');
  }

  /** Ensure the pipeline status directory exists and start watching */
  start(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.cleanStaleFiles();
    this.registerIpc();

    try {
      this.watcher = fs.watch(this.dir, { persistent: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        this.handleFileChange(filename);
      });
      diagLog('pipeline:watcher-started', { dir: this.dir });
    } catch (err) {
      diagLog('pipeline:watcher-error', { error: String(err) });
    }

    // Read any existing files on startup
    this.scanExisting();

    // Periodic rescan as fallback — fs.watch can miss events
    this.rescanTimer = setInterval(() => this.scanExisting(), 30_000);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
  }

  private registerIpc(): void {
    ipcMain.on(IPC.PIPELINE_DISMISS, (_event, paneId: string) => {
      if (!VALID_PANE_ID.test(paneId)) return;

      // Remove all status files for this pane
      try {
        const files = fs.readdirSync(this.dir).filter(f => f.startsWith(paneId) && f.endsWith('.json'));
        for (const f of files) {
          try { fs.unlinkSync(path.join(this.dir, f)); } catch {}
        }
      } catch {}

      // Write a dismiss marker so the monitor script knows to stop
      try {
        fs.writeFileSync(path.join(this.dir, `${paneId}.dismissed`), '');
      } catch {}

      // Clear cached status for all files matching this pane
      for (const key of this.lastStatus.keys()) {
        if (key.startsWith(paneId)) this.lastStatus.delete(key);
      }
      this.sendToRenderer(paneId, null);
    });
  }

  private scanExisting(): void {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      const seenPanes = new Set<string>();
      for (const file of files) {
        this.handleFileChange(file);
        const paneId = file.split('-').slice(0, 5).join('-'); // extract UUID
        seenPanes.add(paneId);
      }
      // If a pane had status but no file anymore, send null
      for (const key of this.lastStatus.keys()) {
        const paneId = key.split('-').slice(0, 5).join('-');
        if (!seenPanes.has(paneId)) {
          this.lastStatus.delete(key);
          this.sendToRenderer(paneId, null);
        }
      }
    } catch {
      // Dir doesn't exist or read error
    }
  }

  private handleFileChange(filename: string): void {
    // Filename format: {paneId}-{buildId}.json or legacy {paneId}.json
    const basename = filename.replace('.json', '');
    const parts = basename.split('-');
    // UUID is 5 groups separated by hyphens
    const paneId = parts.slice(0, 5).join('-');
    if (!VALID_PANE_ID.test(paneId)) return;

    const filePath = path.join(this.dir, filename);

    // Verify resolved path stays inside pipeline dir (defense in depth)
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.dir) + path.sep)) return;

    try {
      if (!fs.existsSync(filePath)) {
        // File was deleted — pipeline tracking ended
        this.lastStatus.delete(basename);
        this.sendToRenderer(paneId, null);
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      // Debounce: skip if content hasn't changed
      if (this.lastStatus.get(basename) === raw) return;
      this.lastStatus.set(basename, raw);

      const status: PipelineStatus = JSON.parse(raw);
      this.sendToRenderer(paneId, status);
    } catch {
      // Partial write or invalid JSON — wait for next event
    }
  }

  private sendToRenderer(paneId: string, status: PipelineStatus | null): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.PIPELINE_STATUS_UPDATE, paneId, status);
    }
  }

  /** Remove status files older than 24 hours */
  private cleanStaleFiles(): void {
    try {
      const files = fs.readdirSync(this.dir);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const file of files) {
        if (!file.endsWith('.json') && !file.endsWith('.dismissed')) continue;
        const filePath = path.join(this.dir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          diagLog('pipeline:cleaned-stale', { file });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
