import { app, autoUpdater, Notification, BrowserWindow, shell } from 'electron';
import Store from 'electron-store';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { spawn } from 'node:child_process';
import { IPC } from '../shared/ipc-channels';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';

const GITHUB_REPO = 'InbarR/tmax';
// Allow overriding for local testing (dev builds only): set TMAX_UPDATE_TEST_URL=http://localhost:9999
const testUrl = !app.isPackaged ? process.env.TMAX_UPDATE_TEST_URL : undefined;
const GITHUB_RELEASES_URL = testUrl
  ? `${testUrl}/releases/latest`
  : `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = testUrl ? 3_000 : 10_000;

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
  // Track the downloaded macOS .dmg so restartAndUpdate can swap the bundle.
  private macDmgPath: string | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.updateInfo = {
      status: 'idle',
      current: app.getVersion(),
    };
    // Squirrel native auto-update only works on packaged Windows. macOS
    // Squirrel.Mac requires an Apple-signed + notarized bundle, which tmax is
    // not (ad-hoc signed only), so it can never apply an update there - it just
    // spins "Updating…" forever. macOS instead uses a DMG-swap updater (see
    // checkMacUpdate / applyMacUpdate). Linux uses manual package download.
    this.supportsAutoUpdate = app.isPackaged && process.platform === 'win32';
  }

  start(): void {
    if (testUrl) {
      console.log(`[update] TEST MODE: using ${testUrl} instead of GitHub API`);
    }
    if (this.supportsAutoUpdate) {
      this.setupAutoUpdater();
    } else if (process.platform === 'darwin' && app.isPackaged) {
      this.setupMacUpdater();
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
      this.checkWindowsUpdate();
    } else if (process.platform === 'darwin' && app.isPackaged) {
      this.checkMacUpdate();
    } else if (process.platform === 'linux' && app.isPackaged) {
      this.checkLinuxUpdate();
    } else {
      this.checkGitHub();
    }
  }

  restartAndUpdate(): void {
    if (this.supportsAutoUpdate && this.updateInfo.status === 'downloaded') {
      autoUpdater.quitAndInstall();
    } else if (process.platform === 'darwin' && this.macDmgPath && this.updateInfo.status === 'downloaded') {
      // macOS: swap the .app bundle from the downloaded DMG via a detached
      // helper that outlives this process (see applyMacUpdate).
      this.applyMacUpdate();
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
      // TASK-130: Squirrel's releaseName for arch-split builds carries the
      // platform suffix (e.g. "1.7.3-x64") because the nupkg id is
      // "tmax-x64". Strip the trailing -x64 / -arm64 / -ia32 so the user
      // sees the plain semver in the modal title.
      const version = (releaseName || '')
        .replace(/^v/, '')
        .replace(/-(x64|arm64|ia32)$/i, '') || undefined;
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
      // Squirrel is Windows-only now; fall back to the GitHub manual-download
      // notification so the user still learns an update exists.
      this.checkGitHub();
    });

    // setupAutoUpdater only runs on packaged Windows (Squirrel). macOS schedules
    // its own DMG-swap checker in setupMacUpdater().
    this.timeoutId = setTimeout(() => {
      this.checkWindowsUpdate();
      this.intervalId = setInterval(() => this.checkWindowsUpdate(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
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
      // Squirrel requests /RELEASES?id=...&localVersion=...&arch=... (with query
      // string and sometimes lowercase /releases). Match by path only, case
      // insensitive, to serve the file regardless of the querystring.
      const pathOnly = (req.url || '').split('?')[0].toLowerCase();
      if (pathOnly === '/releases' || pathOnly === '/') {
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

  // ── macOS: DMG-swap self-update (no Apple signing required) ────────────
  //
  // Squirrel.Mac can't update an ad-hoc-signed app, so we do what the manual
  // workaround does: download the latest arch-specific .dmg, then on
  // "Restart & Update" launch a DETACHED helper that waits for tmax to quit,
  // mounts the DMG, atomically swaps /Applications/tmax.app, clears the
  // quarantine flag, and relaunches. Detaching is essential - the helper must
  // outlive the tmax process it is replacing.

  private setupMacUpdater(): void {
    this.timeoutId = setTimeout(() => {
      this.checkMacUpdate();
      this.intervalId = setInterval(() => this.checkMacUpdate(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  private async checkMacUpdate(): Promise<void> {
    try {
      const release = await this.fetchLatestRelease();
      if (!release) return;

      const tagName = release.tag_name;
      const currentVersion = app.getVersion();
      if (this.compareVersions(tagName, currentVersion) <= 0) return;
      const latestClean = tagName.replace(/^v/, '');

      // Pick the architecture-specific DMG (fall back to any darwin .dmg).
      const arch = process.arch; // 'arm64' | 'x64'
      const dmgAsset = release.assets.find((a) => a.name.endsWith(`${arch}.dmg`))
        || release.assets.find((a) => a.name.endsWith('.dmg'));

      if (!dmgAsset) {
        // No DMG to swap - degrade to a manual "Download" notification.
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

      // Download the DMG to a temp dir (skip a non-empty existing copy).
      this.setStatus('downloading');
      this.updateInfo = { ...this.updateInfo, latest: latestClean };
      this.broadcastUpdate();

      const tmpDir = path.join(os.tmpdir(), 'tmax-update');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const destPath = path.join(tmpDir, dmgAsset.name);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        await this.downloadFile(dmgAsset.browser_download_url, destPath);
      }

      this.macDmgPath = destPath;
      this.updateInfo = {
        status: 'downloaded',
        current: currentVersion,
        latest: latestClean,
        url: release.html_url,
        releaseNotes: release.body || undefined,
      };
      this.broadcastUpdate();
      this.showNotification('tmax Update Ready', `Version ${latestClean} downloaded. Click "Restart & Update" to install.`, latestClean);
    } catch (err) {
      console.error('macOS update check failed:', err);
      // Last resort: manual download link via the GitHub notification.
      this.checkGitHub();
    }
  }

  /**
   * Replace the running .app with the bundle inside the downloaded DMG, via a
   * detached helper that survives this process exiting. The swap moves the old
   * bundle aside first and only deletes it once the new one is in place, so a
   * failure can never leave tmax.app missing.
   */
  private applyMacUpdate(): void {
    const dmg = this.macDmgPath;
    if (!dmg || !fs.existsSync(dmg)) {
      console.error('[update] macOS: no DMG to apply');
      return;
    }
    // Resolve the .app bundle from the executable path:
    //   /Applications/tmax.app/Contents/MacOS/tmax -> /Applications/tmax.app
    const exe = app.getPath('exe');
    const appBundle = path.dirname(path.dirname(path.dirname(exe)));
    if (!appBundle.endsWith('.app')) {
      console.error('[update] macOS: could not resolve .app bundle from', exe);
      return;
    }

    const scriptPath = path.join(os.tmpdir(), 'tmax-update.sh');
    const logPath = path.join(os.tmpdir(), 'tmax-update.log');
    const mountPoint = path.join(os.tmpdir(), 'tmax-update-mnt');

    // Paths are passed as positional args ($1..$4) - nothing is interpolated
    // into the script body, so there is no shell-injection surface.
    const script = [
      '#!/bin/bash',
      'set -u',
      'APP="$1"; DMG="$2"; MOUNT="$3"; LOG="$4"',
      'exec >"$LOG" 2>&1',
      'echo "[tmax-update] start $(date) APP=$APP"',
      '# Wait for tmax to fully exit (parent calls app.quit right after us).',
      'for i in $(seq 1 30); do',
      '  pgrep -f "$APP/Contents/MacOS/" >/dev/null 2>&1 || break',
      '  sleep 1',
      'done',
      'pkill -f "$APP/Contents/MacOS/" 2>/dev/null || true',
      'sleep 1',
      '# Mount the DMG.',
      'mkdir -p "$MOUNT"',
      'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true',
      'if ! hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT"; then',
      '  echo "[tmax-update] mount failed"; open "$APP"; exit 1',
      'fi',
      '# Locate the new .app inside the DMG.',
      'SRC="$MOUNT/tmax.app"',
      'if [ ! -d "$SRC" ]; then SRC="$(find "$MOUNT" -maxdepth 1 -name "*.app" -print -quit)"; fi',
      'if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then',
      '  echo "[tmax-update] no .app in dmg"; hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; open "$APP"; exit 1',
      'fi',
      '# Stage a copy on the same volume so the final swap is a fast rename.',
      'PARENT="$(dirname "$APP")"',
      'STAGE="$PARENT/.tmax-update-new"',
      'BACKUP="$PARENT/.tmax-update-old"',
      'rm -rf "$STAGE" "$BACKUP"',
      'if ! cp -R "$SRC" "$STAGE"; then',
      '  echo "[tmax-update] copy failed"; rm -rf "$STAGE"; hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; open "$APP"; exit 1',
      'fi',
      'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true',
      '# Swap by move - never leave $APP missing; restore on any failure.',
      'if mv "$APP" "$BACKUP" 2>/dev/null; then',
      '  if mv "$STAGE" "$APP" 2>/dev/null; then',
      '    rm -rf "$BACKUP"',
      '  else',
      '    echo "[tmax-update] install failed, restoring"; mv "$BACKUP" "$APP" 2>/dev/null || true; rm -rf "$STAGE"; open "$APP"; exit 1',
      '  fi',
      'else',
      '  echo "[tmax-update] cannot replace $APP (permissions?); keeping current"; rm -rf "$STAGE"; open "$APP"; exit 1',
      'fi',
      '# Clear quarantine + relaunch.',
      'xattr -cr "$APP" 2>/dev/null || true',
      'rm -f "$DMG"',
      'echo "[tmax-update] done $(date)"',
      'open "$APP"',
      '',
    ].join('\n');

    try {
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });
    } catch (err) {
      console.error('[update] macOS: failed to write updater script', err);
      return;
    }

    // Detached + unref so the helper is reparented to launchd and survives the
    // app quitting. It logs to $LOG itself, so stdio is ignored.
    const child = spawn('/bin/bash', [scriptPath, appBundle, dmg, mountPoint], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Give the helper a moment to start, then quit so it can replace the bundle.
    setTimeout(() => app.quit(), 600);
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
