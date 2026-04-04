import { app, autoUpdater, Notification, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { createServer } from 'http';
import { IPC } from '../shared/ipc-channels';

const GITHUB_REPO = 'InbarR/tmax';
const UPDATE_SERVER = 'https://update.electronjs.org';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = 5000;

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'available' | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  current: string;
  latest?: string;
  url?: string;
  error?: string;
  releaseNotes?: string;
}

export class VersionChecker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private mainWindow: BrowserWindow;
  private updateInfo: UpdateInfo;
  private supportsAutoUpdate: boolean;
  private versionStore = new Store({ name: 'tmax-version-check' });

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.updateInfo = {
      status: 'idle',
      current: app.getVersion(),
    };
    // Auto-update works on packaged Windows/macOS builds only
    this.supportsAutoUpdate = app.isPackaged &&
      (process.platform === 'win32' || process.platform === 'darwin');
  }

  start(): void {
    if (this.supportsAutoUpdate) {
      this.setupAutoUpdater();
    } else {
      this.setupGitHubPolling();
    }
  }

  stop(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getUpdateInfo(): UpdateInfo {
    return this.updateInfo;
  }

  checkNow(): void {
    if (this.supportsAutoUpdate) {
      if (process.platform === 'win32') {
        this.checkWindowsUpdate();
      } else {
        autoUpdater.checkForUpdates();
      }
    } else {
      this.checkGitHub();
    }
  }

  restartAndUpdate(): void {
    if (this.supportsAutoUpdate && this.updateInfo.status === 'downloaded') {
      autoUpdater.quitAndInstall();
    }
  }

  private setupAutoUpdater(): void {
    // Register autoUpdater event handlers (common for all platforms)
    autoUpdater.on('checking-for-update', () => {
      this.setStatus('checking');
    });

    autoUpdater.on('update-available', () => {
      this.setStatus('downloading');
    });

    autoUpdater.on('update-not-available', () => {
      this.setStatus('idle');
    });

    autoUpdater.on('update-downloaded', async (_event, _releaseNotes, releaseName) => {
      const version = (releaseName || '').replace(/^v/, '') || undefined;
      const releaseNotes = await this.fetchReleaseNotes();
      this.updateInfo = {
        ...this.updateInfo,
        status: 'downloaded',
        latest: version,
        releaseNotes,
      };
      this.broadcastUpdate();

      // Show native notification once
      const lastNotified = this.versionStore.get('lastNotifiedVersion', '') as string;
      if (version && lastNotified !== version && Notification.isSupported()) {
        const notification = new Notification({
          title: 'tmax Update Ready',
          body: `Version ${version} downloaded. Restart to apply.`,
        });
        notification.show();
        this.versionStore.set('lastNotifiedVersion', version);
      }
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('Auto-update error:', err.message);
      this.updateInfo = {
        ...this.updateInfo,
        status: 'error',
        error: err.message,
      };
      this.broadcastUpdate();
      // Fall back to GitHub API to at least show the available version
      this.checkGitHub();
    });

    if (process.platform === 'win32') {
      // On Windows, update.electronjs.org returns Setup.exe instead of .nupkg
      // because the nupkg filename lacks an architecture qualifier. This breaks
      // Squirrel auto-update. Bypass the update server and resolve the nupkg
      // URL directly from the GitHub release assets.
      this.timeoutId = setTimeout(() => {
        this.checkWindowsUpdate();
        this.intervalId = setInterval(() => this.checkWindowsUpdate(), CHECK_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    } else {
      // macOS: update.electronjs.org correctly returns .zip files
      const feedURL = `${UPDATE_SERVER}/${GITHUB_REPO}/${process.platform}-${process.arch}/${app.getVersion()}`;
      try {
        autoUpdater.setFeedURL({ url: feedURL });
      } catch (err) {
        console.error('Failed to set auto-update feed URL:', err);
        this.supportsAutoUpdate = false;
        this.setupGitHubPolling();
        return;
      }
      this.timeoutId = setTimeout(() => {
        autoUpdater.checkForUpdates();
        this.intervalId = setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    }
  }

  // Windows auto-update: fetch the latest release from GitHub, find the .nupkg
  // asset URL, and serve it to Squirrel via a one-shot local HTTP server.
  private async checkWindowsUpdate(): Promise<void> {
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { 'User-Agent': 'tmax-update-checker' },
      });
      if (!res.ok) return;

      const data = await res.json();
      const tagName: string = data.tag_name;
      if (this.compareVersions(tagName, app.getVersion()) <= 0) return;

      // Find the .nupkg asset — Squirrel needs this for auto-update
      const nupkgAsset = (data.assets as { name: string; browser_download_url: string }[])
        ?.find((a) => a.name.endsWith('.nupkg'));
      if (!nupkgAsset) {
        this.checkGitHub();
        return;
      }

      // Squirrel expects the feed URL to return JSON: { url, name, notes }
      // Create a one-shot local server that returns the correct nupkg URL
      const server = createServer((_req, resp) => {
        resp.writeHead(200, { 'Content-Type': 'application/json' });
        resp.end(JSON.stringify({
          url: nupkgAsset.browser_download_url,
          name: tagName,
          notes: data.body || '',
        }));
        setTimeout(() => server.close(), 1000);
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (!port) {
        server.close();
        this.checkGitHub();
        return;
      }

      // Close the server if autoUpdater doesn't request within 30s
      const safetyTimer = setTimeout(() => server.close(), 30_000);
      server.on('close', () => clearTimeout(safetyTimer));

      autoUpdater.setFeedURL({ url: `http://127.0.0.1:${port}` });
      autoUpdater.checkForUpdates();
    } catch {
      this.checkGitHub();
    }
  }

  private setupGitHubPolling(): void {
    this.timeoutId = setTimeout(() => {
      this.checkGitHub();
      this.intervalId = setInterval(() => this.checkGitHub(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  private async checkGitHub(): Promise<void> {
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { 'User-Agent': 'tmax-update-checker' },
      });
      if (!res.ok) return;

      const data = await res.json();
      const tagName: string = data.tag_name;
      const htmlUrl: string = data.html_url;
      const releaseNotes: string | undefined = data.body || undefined;
      const currentVersion = app.getVersion();

      if (this.compareVersions(tagName, currentVersion) > 0) {
        const latestClean = tagName.replace(/^v/, '');
        this.updateInfo = {
          status: 'available',
          current: currentVersion,
          latest: latestClean,
          url: htmlUrl,
          releaseNotes,
        };
        this.broadcastUpdate();

        // Show native notification once per new version
        const lastNotified = this.versionStore.get('lastNotifiedVersion', '') as string;
        if (lastNotified !== latestClean && Notification.isSupported()) {
          const notification = new Notification({
            title: 'tmax Update Available',
            body: `Version ${latestClean} is available (you have ${currentVersion})`,
          });
          notification.show();
          this.versionStore.set('lastNotifiedVersion', latestClean);
        }
      }
    } catch {
      // Silently ignore network errors
    }
  }

  private setStatus(status: UpdateStatus): void {
    this.updateInfo = { ...this.updateInfo, status };
    this.broadcastUpdate();
  }

  private broadcastUpdate(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.VERSION_UPDATE_STATUS, this.updateInfo);
    }
  }

  private async fetchReleaseNotes(): Promise<string | undefined> {
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { 'User-Agent': 'tmax-update-checker' },
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      return data.body || undefined;
    } catch {
      return undefined;
    }
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}
