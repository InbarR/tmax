import { app, autoUpdater, Notification, BrowserWindow, shell } from 'electron';
import Store from 'electron-store';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { IPC } from '../shared/ipc-channels';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';

const GITHUB_REPO = 'InbarR/tmax';
const UPDATE_SERVER = 'https://update.electronjs.org';
// Allow overriding for local testing: set TMAX_UPDATE_TEST_URL=http://localhost:9999
const GITHUB_RELEASES_URL = process.env.TMAX_UPDATE_TEST_URL
  ? `${process.env.TMAX_UPDATE_TEST_URL}/releases/latest`
  : `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = process.env.TMAX_UPDATE_TEST_URL ? 3_000 : 10_000;

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'available' | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  current: string;
  latest?: string;
  url?: string;
  error?: string;
  releaseNotes?: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body?: string;
  assets: GitHubAsset[];
}

export class VersionChecker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private mainWindow: BrowserWindow;
  private updateInfo: UpdateInfo;
  private supportsAutoUpdate: boolean;
  private versionStore = new Store({ name: 'tmax-version-check' });
  private feedServer: Server | null = null;
  // Track pending Linux download so we can call restartAndUpdate later
  private linuxPackagePath: string | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.updateInfo = {
      status: 'idle',
      current: app.getVersion(),
    };
    // Native auto-update (Squirrel) on packaged Windows/macOS only
    this.supportsAutoUpdate = app.isPackaged &&
      (process.platform === 'win32' || process.platform === 'darwin');
  }

  start(): void {
    if (process.env.TMAX_UPDATE_TEST_URL) {
      console.log(`[update] TEST MODE: using ${process.env.TMAX_UPDATE_TEST_URL} instead of GitHub API`);
    }
    if (this.supportsAutoUpdate) {
      this.setupAutoUpdater();
    } else if (process.platform === 'linux' && app.isPackaged) {
      this.setupLinuxUpdater();
    } else {
      this.setupGitHubPolling();
    }
  }

  stop(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.intervalId) clearInterval(this.intervalId);
    this.closeFeedServer();
  }

  getUpdateInfo(): UpdateInfo {
    return this.updateInfo;
  }

  checkNow(): void {
    if (this.supportsAutoUpdate) {
      if (process.platform === 'win32') {
        this.checkWindowsUpdate();
      } else {
        this.checkMacUpdate();
      }
    } else if (process.platform === 'linux' && app.isPackaged) {
      this.checkLinuxUpdate();
    } else {
      this.checkGitHub();
    }
  }

  restartAndUpdate(): void {
    if (this.supportsAutoUpdate && this.updateInfo.status === 'downloaded') {
      autoUpdater.quitAndInstall();
    } else if (process.platform === 'linux' && this.linuxPackagePath) {
      // On Linux, open the folder containing the downloaded package
      shell.showItemInFolder(this.linuxPackagePath);
    }
  }

  // ── Auto-updater setup (Windows + macOS) ──────────────────────────────

  private setupAutoUpdater(): void {
    autoUpdater.on('checking-for-update', () => {
      console.log('[update] Squirrel: checking-for-update');
      this.setStatus('checking');
    });

    autoUpdater.on('update-available', () => {
      console.log('[update] Squirrel: update-available');
      this.setStatus('downloading');
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[update] Squirrel: update-not-available');
      this.setStatus('idle');
    });

    autoUpdater.on('update-downloaded', async (_event, _releaseNotes, releaseName) => {
      console.log('[update] Squirrel: update-downloaded, releaseName:', releaseName);
      const version = (releaseName || '').replace(/^v/, '') || undefined;
      const releaseNotes = await this.fetchReleaseNotes();
      this.updateInfo = {
        ...this.updateInfo,
        status: 'downloaded',
        latest: version,
        releaseNotes,
      };
      this.broadcastUpdate();
      this.closeFeedServer();
      this.showNotification('tmax Update Ready', `Version ${version} downloaded. Restart to apply.`, version);
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('Auto-update error:', err.message);
      this.updateInfo = { ...this.updateInfo, status: 'error', error: err.message };
      this.broadcastUpdate();
      this.closeFeedServer();
      // On macOS, try the GitHub API fallback before giving up to manual download
      if (process.platform === 'darwin') {
        this.checkMacUpdateFallback();
      } else {
        this.checkGitHub();
      }
    });

    if (process.platform === 'win32') {
      this.timeoutId = setTimeout(() => {
        this.checkWindowsUpdate();
        this.intervalId = setInterval(() => this.checkWindowsUpdate(), CHECK_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    } else {
      // macOS
      this.timeoutId = setTimeout(() => {
        this.checkMacUpdate();
        this.intervalId = setInterval(() => this.checkMacUpdate(), CHECK_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    }
  }

  // ── Windows: Squirrel update via proper RELEASES file ─────────────────

  private async checkWindowsUpdate(): Promise<void> {
    try {
      this.setStatus('checking');
      const release = await this.fetchLatestRelease();
      if (!release) return this.setStatus('idle');

      const tagName = release.tag_name;
      console.log(`[update] Windows: latest release ${tagName}, current ${app.getVersion()}`);
      if (this.compareVersions(tagName, app.getVersion()) <= 0) {
        this.setStatus('idle');
        return;
      }

      // Find arch-specific RELEASES file (e.g. RELEASES-x64)
      const arch = process.arch; // x64 or arm64
      const releasesAsset = release.assets.find(
        (a) => a.name === `RELEASES-${arch}` || a.name === 'RELEASES'
      );
      // Find arch-specific nupkg
      const nupkgAsset = release.assets.find(
        (a) => a.name.endsWith('.nupkg') && (a.name.includes(arch) || !release.assets.some(b => b.name.includes(arch) && b.name.endsWith('.nupkg')))
      );

      console.log(`[update] Windows: RELEASES asset=${releasesAsset?.name}, nupkg=${nupkgAsset?.name}`);

      if (!releasesAsset || !nupkgAsset) {
        console.warn('[update] Squirrel artifacts not found in release, falling back to GitHub polling');
        this.checkGitHub();
        return;
      }

      // Download the RELEASES file content
      const releasesContent = await this.downloadText(releasesAsset.browser_download_url);
      if (!releasesContent) {
        console.warn('[update] Failed to download RELEASES file');
        this.checkGitHub();
        return;
      }
      console.log(`[update] Windows: raw RELEASES content: ${releasesContent.trim()}`);

      // Rewrite nupkg references in RELEASES to full GitHub download URLs
      // RELEASES format: <sha> <filename> <size>
      const nupkgBaseUrl = nupkgAsset.browser_download_url.substring(
        0, nupkgAsset.browser_download_url.lastIndexOf('/') + 1
      );
      const rewrittenReleases = releasesContent.split('\n').map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const filename = parts[1];
          // Find the matching asset URL for this nupkg filename
          const asset = release.assets.find((a) => a.name === filename);
          if (asset) {
            parts[1] = asset.browser_download_url;
          } else {
            // Fallback: construct URL from base
            parts[1] = nupkgBaseUrl + filename;
          }
        }
        return parts.join(' ');
      }).filter(Boolean).join('\n');

      console.log(`[update] Windows: rewritten RELEASES: ${rewrittenReleases.trim()}`);

      // Start (or reuse) local HTTP server to serve the RELEASES file
      await this.startFeedServer(rewrittenReleases);

      const addr = this.feedServer!.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (!port) {
        this.closeFeedServer();
        this.checkGitHub();
        return;
      }

      console.log(`[update] Windows: feed server on port ${port}, calling autoUpdater.checkForUpdates()`);
      autoUpdater.setFeedURL({ url: `http://127.0.0.1:${port}` });
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('[update] Windows update check failed:', err);
      this.checkGitHub();
    }
  }

  /**
   * Start a local HTTP server that serves the Squirrel RELEASES file.
   * Squirrel.Windows fetches `{feedURL}/RELEASES` and then downloads
   * nupkg files from the URLs listed inside.
   */
  private async startFeedServer(releasesContent: string): Promise<void> {
    this.closeFeedServer();

    this.feedServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      console.log(`[update] Feed server request: ${req.method} ${req.url}`);
      // Squirrel requests /RELEASES (or just /)
      if (req.url === '/RELEASES' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(releasesContent);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve) => this.feedServer!.listen(0, '127.0.0.1', resolve));

    // Auto-close after 60s if Squirrel doesn't complete
    const safetyTimer = setTimeout(() => this.closeFeedServer(), 60_000);
    this.feedServer.on('close', () => clearTimeout(safetyTimer));
  }

  private closeFeedServer(): void {
    if (this.feedServer) {
      try { this.feedServer.close(); } catch { /* ignore */ }
      this.feedServer = null;
    }
  }

  // ── macOS: update.electronjs.org with GitHub API fallback ─────────────

  private async checkMacUpdate(): Promise<void> {
    const feedURL = `${UPDATE_SERVER}/${GITHUB_REPO}/${process.platform}-${process.arch}/${app.getVersion()}`;
    try {
      autoUpdater.setFeedURL({ url: feedURL });
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('macOS auto-update via update.electronjs.org failed:', err);
      // Fallback: use GitHub API to find the .zip and serve a JSON feed
      await this.checkMacUpdateFallback();
    }
  }

  private async checkMacUpdateFallback(): Promise<void> {
    try {
      const release = await this.fetchLatestRelease();
      if (!release) return;

      const tagName = release.tag_name;
      if (this.compareVersions(tagName, app.getVersion()) <= 0) return;

      // Find the macOS .zip asset for current architecture
      const arch = process.arch;
      const zipAsset = release.assets.find(
        (a) => a.name.endsWith('.zip') && a.name.includes('darwin') && a.name.includes(arch)
      ) || release.assets.find(
        (a) => a.name.endsWith('.zip') && a.name.includes('darwin')
      );

      if (!zipAsset) {
        this.checkGitHub();
        return;
      }

      // Squirrel.Mac expects a JSON response with { url, name?, notes?, pub_date? }
      this.closeFeedServer();
      this.feedServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          url: zipAsset.browser_download_url,
          name: tagName,
          notes: release.body || '',
        }));
      });

      await new Promise<void>((resolve) => this.feedServer!.listen(0, '127.0.0.1', resolve));
      const addr = this.feedServer!.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (!port) {
        this.closeFeedServer();
        this.checkGitHub();
        return;
      }

      const safetyTimer = setTimeout(() => this.closeFeedServer(), 60_000);
      this.feedServer.on('close', () => clearTimeout(safetyTimer));

      autoUpdater.setFeedURL({ url: `http://127.0.0.1:${port}`, serverType: 'json' as any });
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('macOS fallback update check failed:', err);
      this.checkGitHub();
    }
  }

  // ── Linux: download package and show in folder ────────────────────────

  private setupLinuxUpdater(): void {
    this.timeoutId = setTimeout(() => {
      this.checkLinuxUpdate();
      this.intervalId = setInterval(() => this.checkLinuxUpdate(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  private async checkLinuxUpdate(): Promise<void> {
    try {
      const release = await this.fetchLatestRelease();
      if (!release) return;

      const tagName = release.tag_name;
      const currentVersion = app.getVersion();
      if (this.compareVersions(tagName, currentVersion) <= 0) return;

      const latestClean = tagName.replace(/^v/, '');

      // Detect distro package type
      const ext = this.detectLinuxPackageType();
      const asset = release.assets.find((a) => a.name.endsWith(ext));

      if (!asset) {
        // No matching package — fall back to showing release URL
        this.updateInfo = {
          status: 'available',
          current: currentVersion,
          latest: latestClean,
          url: release.html_url,
          releaseNotes: release.body || undefined,
        };
        this.broadcastUpdate();
        this.showNotification('tmax Update Available', `Version ${latestClean} is available`, latestClean);
        return;
      }

      // Download the package to temp directory
      this.setStatus('downloading');
      this.updateInfo = { ...this.updateInfo, latest: latestClean };
      this.broadcastUpdate();

      const tmpDir = path.join(os.tmpdir(), 'tmax-update');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const destPath = path.join(tmpDir, asset.name);

      // Skip download if already downloaded
      if (!fs.existsSync(destPath)) {
        await this.downloadFile(asset.browser_download_url, destPath);
      }

      this.linuxPackagePath = destPath;
      this.updateInfo = {
        status: 'downloaded',
        current: currentVersion,
        latest: latestClean,
        url: release.html_url,
        releaseNotes: release.body || undefined,
      };
      this.broadcastUpdate();
      this.showNotification(
        'tmax Update Downloaded',
        `Version ${latestClean} downloaded. Click "Restart & Update" to view the package.`,
        latestClean
      );
    } catch (err) {
      console.error('Linux update check failed:', err);
      this.checkGitHub();
    }
  }

  private detectLinuxPackageType(): string {
    // Check for dpkg (Debian/Ubuntu) vs rpm (Fedora/RHEL)
    try {
      const { execSync } = require('child_process');
      execSync('which dpkg', { stdio: 'ignore' });
      return '.deb';
    } catch {
      try {
        const { execSync } = require('child_process');
        execSync('which rpm', { stdio: 'ignore' });
        return '.rpm';
      } catch {
        return '.deb'; // default
      }
    }
  }

  // ── GitHub polling fallback (dev mode or when auto-update fails) ──────

  private setupGitHubPolling(): void {
    this.timeoutId = setTimeout(() => {
      this.checkGitHub();
      this.intervalId = setInterval(() => this.checkGitHub(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  private async checkGitHub(): Promise<void> {
    try {
      const release = await this.fetchLatestRelease();
      if (!release) return;

      const tagName = release.tag_name;
      const currentVersion = app.getVersion();

      if (this.compareVersions(tagName, currentVersion) > 0) {
        const latestClean = tagName.replace(/^v/, '');
        this.updateInfo = {
          status: 'available',
          current: currentVersion,
          latest: latestClean,
          url: release.html_url,
          releaseNotes: release.body || undefined,
        };
        this.broadcastUpdate();
        this.showNotification('tmax Update Available', `Version ${latestClean} is available (you have ${currentVersion})`, latestClean);
      }
    } catch {
      // Silently ignore network errors
    }
  }

  // ── Shared helpers ────────────────────────────────────────────────────

  private async fetchLatestRelease(): Promise<GitHubRelease | null> {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { 'User-Agent': 'tmax-update-checker' },
    });
    if (!res.ok) return null;
    return res.json() as Promise<GitHubRelease>;
  }

  private async fetchReleaseNotes(): Promise<string | undefined> {
    try {
      const release = await this.fetchLatestRelease();
      return release?.body || undefined;
    } catch {
      return undefined;
    }
  }

  /** Download a text file (e.g., RELEASES) following redirects. */
  private async downloadText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'tmax-update-checker' },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      return res.text();
    } catch {
      return null;
    }
  }

  /** Download a binary file to disk, following redirects. */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doRequest = (reqUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const parsedUrl = new URL(reqUrl);
        const mod = parsedUrl.protocol === 'https:' ? https : require('http');
        mod.get(reqUrl, { headers: { 'User-Agent': 'tmax-update-checker' } }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return doRequest(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          const ws = fs.createWriteStream(destPath);
          res.pipe(ws);
          ws.on('finish', () => { ws.close(); resolve(); });
          ws.on('error', (err: Error) => { res.destroy(); reject(err); });
          res.on('error', (err: Error) => { ws.destroy(); reject(err); });
        }).on('error', reject);
      };
      doRequest(url);
    });
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

  private showNotification(title: string, body: string, version?: string): void {
    if (!version) return;
    const lastNotified = this.versionStore.get('lastNotifiedVersion', '') as string;
    if (lastNotified !== version && Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.show();
      this.versionStore.set('lastNotifiedVersion', version);
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
