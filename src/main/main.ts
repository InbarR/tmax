import { app, BrowserWindow, ipcMain, Menu, nativeTheme, powerMonitor, session, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Store from 'electron-store';
import { PtyManager } from './pty-manager';
import { ConfigStore } from './config-store';
import type { BackgroundMaterial } from './config-store';
import { IPC } from '../shared/ipc-channels';
import { CopilotSessionMonitor } from './copilot-session-monitor';
import { CopilotSessionWatcher } from './copilot-session-watcher';
import { notifyCopilotSession, clearNotificationCooldowns } from './copilot-notification';
import { ClaudeCodeSessionMonitor } from './claude-code-session-monitor';
import { ClaudeCodeSessionWatcher } from './claude-code-session-watcher';
import { WslSessionManager } from './wsl-session-manager';
import { VersionChecker } from './version-checker';
import { initDiagLogger, getDiagLogPath, diagLog } from './diag-logger';
import { GitDiffService, resolveGitRoot } from './git-diff-service';
import { listWorktrees, createWorktree, deleteWorktree, getBranches } from './git-worktree-service';
import type { DiffMode } from '../shared/diff-types';

// Handle Squirrel.Windows lifecycle events (install, update, uninstall)
// Must be at the top before any other initialization
if (process.platform === 'win32') {
  const squirrelArg = process.argv[1];
  if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
    // Create/update desktop and start menu shortcuts
    const { execSync } = require('child_process');
    const path = require('path');
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const exeName = path.basename(process.execPath);
    try {
      execSync(`"${updateExe}" --createShortcut="${exeName}"`);
    } catch { /* ignore */ }
    app.quit();
  } else if (squirrelArg === '--squirrel-uninstall') {
    const { execSync } = require('child_process');
    const path = require('path');
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const exeName = path.basename(process.execPath);
    try {
      execSync(`"${updateExe}" --removeShortcut="${exeName}"`);
    } catch { /* ignore */ }
    app.quit();
  } else if (squirrelArg === '--squirrel-obsolete') {
    app.quit();
  }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Returns true if the current platform supports window background materials
 * (Windows 11 22H2+ = build 22621+).
 */
function platformSupportsMaterial(): boolean {
  if (process.platform !== 'win32') return false;
  const release = os.release(); // e.g. "10.0.22621"
  const parts = release.split('.');
  const build = parseInt(parts[2], 10);
  return !isNaN(build) && build >= 22621;
}

/**
 * Converts a hex color + opacity (0-1) into an 8-digit hex string (#RRGGBBAA)
 * that Electron accepts for backgroundColor.
 */
function hexWithAlpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  // Normalize 3-char to 6-char, strip existing alpha
  const normalized = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.substring(0, 6);

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
      .toString(16).padStart(2, '0');
    return `#1e1e2e${alpha}`;
  }

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${normalized}${alpha}`;
}

/**
 * Returns the effective background material and background color for a window,
 * based on the current config.
 */
function getWindowMaterialOpts(): { backgroundMaterial?: BackgroundMaterial; backgroundColor: string } {
  const material = (configStore?.get('backgroundMaterial') as BackgroundMaterial) || 'none';
  const opacity = configStore?.get('backgroundOpacity') as number ?? 0.8;
  const themeBg = configStore?.get('theme')?.background || '#1e1e2e';

  if (material !== 'none' && platformSupportsMaterial()) {
    return {
      backgroundMaterial: material,
      backgroundColor: hexWithAlpha(themeBg, opacity),
    };
  }
  return { backgroundColor: themeBg };
}

/**
 * Applies the current background material and color to a window.
 * Separated from getWindowMaterialOpts so material can be applied *after*
 * window creation / maximize — passing backgroundMaterial in the BrowserWindow
 * constructor causes Windows 11 to grey-out the maximize button (Electron bug).
 */
function applyMaterialToWindow(win: BrowserWindow): void {
  if (!platformSupportsMaterial() || win.isDestroyed()) return;
  const material = (configStore?.get('backgroundMaterial') as BackgroundMaterial) || 'none';
  const opacity = configStore?.get('backgroundOpacity') as number ?? 0.8;
  const themeBg = configStore?.get('theme')?.background || '#1e1e2e';

  (win as any).setBackgroundMaterial(material);
  if (material !== 'none') {
    win.setBackgroundColor(hexWithAlpha(themeBg, opacity));
  } else {
    win.setBackgroundColor(themeBg);
  }
}

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let configStore: ConfigStore | null = null;
let copilotMonitor: CopilotSessionMonitor | null = null;
let copilotWatcher: CopilotSessionWatcher | null = null;
let claudeCodeMonitor: ClaudeCodeSessionMonitor | null = null;
let claudeCodeWatcher: ClaudeCodeSessionWatcher | null = null;
let wslSessionManager: WslSessionManager | null = null;
let versionChecker: VersionChecker | null = null;
let clipboardTempDir: string | null = null;
const CLIPBOARD_DIR_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Remove stale `tmax-clipboard-*` directories from os.tmpdir().
 * Older-than-threshold directories are leftovers from crashed or killed sessions.
 * Live sessions that regularly write images will have a recent mtime and are preserved.
 */
function sweepStaleClipboardDirs(): void {
  try {
    const tmp = os.tmpdir();
    const now = Date.now();
    for (const name of fs.readdirSync(tmp)) {
      if (!name.startsWith('tmax-clipboard-') && name !== 'tmax-clipboard') continue;
      const full = path.join(tmp, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isDirectory()) continue;
        if (now - stat.mtimeMs < CLIPBOARD_DIR_STALE_MS) continue;
        fs.rmSync(full, { recursive: true, force: true });
      } catch { /* skip locked or inaccessible dirs */ }
    }
  } catch { /* tmp listing failed — ignore */ }
}
const sessionStore = new Store({ name: 'tmax-session' });
const detachedWindows = new Map<string, BrowserWindow>();

function broadcastPtyEvent(channel: string, id: string, ...args: unknown[]) {
  mainWindow?.webContents.send(channel, id, ...args);
  const detachedWin = detachedWindows.get(id);
  if (detachedWin && !detachedWin.isDestroyed()) {
    detachedWin.webContents.send(channel, id, ...args);
  }
}

function createWindow(): void {
  // Omit backgroundMaterial from constructor — passing it at creation time
  // causes Windows 11 to grey-out the native maximize button (Electron bug).
  // We apply the material *after* the window is shown via applyMaterialToWindow().
  const { backgroundMaterial: _mat, ...constructorOpts } = getWindowMaterialOpts();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    show: false,
    title: 'tmax',
    icon: path.join(__dirname, '../../assets/icon.png'),
    autoHideMenuBar: true,
    ...constructorOpts,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Content-Security-Policy — prevent XSS, eval, and unauthorized remote resources
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
  const connectSrc = isDev ? "connect-src 'self' ws://localhost:* http://localhost:*" : "connect-src 'self'";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; ` +
          `img-src 'self' data:; font-src 'self' data:; ${connectSrc}; ` +
          `object-src 'none'; base-uri 'none';`,
        ],
      },
    });
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show, displaying...');
    // Reset any Chromium zoom to 100% - we handle zoom ourselves via terminal fontSize
    mainWindow!.webContents.setZoomLevel(0);
    mainWindow!.maximize();
    mainWindow!.show();
    mainWindow!.focus();

    // Apply background material *after* the window is visible and maximized
    // so the native maximize button stays enabled.
    applyMaterialToWindow(mainWindow!);
  });

  // Re-apply background material after maximize / restore state transitions
  mainWindow.on('maximize', () => { applyMaterialToWindow(mainWindow!); });
  mainWindow.on('unmaximize', () => { applyMaterialToWindow(mainWindow!); });

  // Prevent Chromium's built-in zoom — reset zoom level after any zoom attempt
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const primaryMod = process.platform === 'darwin' ? input.meta : input.control;
    if (primaryMod && !input.shift && !input.alt) {
      if (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0') {
        mainWindow!.webContents.setZoomLevel(0);
      }
    }
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    for (const [, win] of detachedWindows) {
      if (!win.isDestroyed()) win.close();
    }
    detachedWindows.clear();
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = ['LOG', 'WARN', 'ERROR'][level] || 'INFO';
    console.log(`[RENDERER ${prefix}] ${message} (${sourceId}:${line})`);
  });

  // Open external links in the default browser instead of in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow?.webContents.getURL();
    if (url !== currentURL && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log('Loading dev server URL:', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const filePath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    console.log('Loading file:', filePath);
    mainWindow.loadFile(filePath);
  }
}

function setupPtyManager(): void {
  ptyManager = new PtyManager({
    onData(id: string, data: string) {
      broadcastPtyEvent(IPC.PTY_DATA, id, data);
    },
    onExit(id: string, exitCode: number | undefined) {
      broadcastPtyEvent(IPC.PTY_EXIT, id, exitCode);
    },
  });
}

function setupConfigStore(): void {
  configStore = new ConfigStore();
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC.PTY_CREATE,
    (_event, opts: { id: string; shellPath: string; args: string[]; cwd: string; env?: Record<string, string>; cols: number; rows: number; wslDistro?: string }) => {
      // Validate shell path against configured profiles to prevent arbitrary exec
      const shells = configStore!.get('shells');
      const profile = shells.find((s: { path: string }) => s.path === opts.shellPath);
      if (!profile) {
        throw new Error(`Shell path not in configured profiles: ${opts.shellPath}`);
      }
      // Clamp cols/rows to reasonable bounds
      const cols = Math.max(1, Math.min(500, opts.cols || 80));
      const rows = Math.max(1, Math.min(200, opts.rows || 24));
      // For WSL sessions targeting a specific distro, use -d <distro> and --cd <cwd>
      let args: string[];
      if (opts.wslDistro) {
        // Validate distro name: must be alphanumeric/dash/dot only (no shell metacharacters)
        if (!/^[\w][\w.\-]*$/.test(opts.wslDistro)) {
          throw new Error(`Invalid WSL distro name: ${opts.wslDistro}`);
        }
        args = ['-d', opts.wslDistro];
        // If the renderer passed a Linux CWD (starts with /), use --cd to set it
        if (opts.cwd && opts.cwd.startsWith('/')) {
          args.push('--cd', opts.cwd);
        }
      } else {
        args = profile.args;
      }
      const { wslDistro: _wsl, ...ptyOpts } = opts;
      // For WSL with --cd, node-pty still needs a valid Windows cwd
      const cwd = opts.wslDistro ? (os.homedir()) : ptyOpts.cwd;
      return ptyManager!.create({ ...ptyOpts, args, cols, rows, cwd });
    }
  );

  ipcMain.handle(
    IPC.PTY_RESIZE,
    (_event, id: string, cols: number, rows: number) => {
      ptyManager!.resize(id, cols, rows);
    }
  );

  ipcMain.handle(IPC.PTY_KILL, (_event, id: string) => {
    ptyManager!.kill(id);
  });

  ipcMain.on(IPC.PTY_WRITE, (_event, id: string, data: string) => {
    ptyManager!.write(id, data);
  });

  ipcMain.handle(IPC.PTY_GET_DIAG, (_event, id: string) => {
    return ptyManager?.getStats(id) ?? null;
  });

  ipcMain.on(IPC.DIAG_LOG, (_event, event: string, data?: Record<string, unknown>) => {
    diagLog(event, data);
  });

  ipcMain.handle(IPC.DIAG_GET_LOG_PATH, () => {
    return getDiagLogPath();
  });

  ipcMain.handle(IPC.GET_SYSTEM_FONTS, async () => {
    if (process.platform !== 'win32') return [];
    try {
      const { execSync } = require('child_process');
      const output = execSync(
        "powershell -NoProfile -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }\"",
        { encoding: 'utf8', timeout: 10000 }
      );
      return output.trim().split('\n').map((s: string) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configStore!.getAll();
  });

  ipcMain.handle(
    IPC.CONFIG_SET,
    (_event, key: string, value: unknown) => {
      // Validate shell paths exist on disk to prevent injection of arbitrary executables
      if (key === 'shells' && Array.isArray(value)) {
        for (const shell of value) {
          if (shell && typeof shell === 'object' && 'path' in shell) {
            if (typeof shell.path !== 'string' || !fs.existsSync(shell.path)) {
              throw new Error(`Invalid shell path: ${shell.path}`);
            }
          }
        }
      }

      configStore!.set(key as keyof ReturnType<ConfigStore['getAll']>, value as never);

      // Dynamically apply background material changes
      if (key === 'backgroundMaterial' || key === 'backgroundOpacity' || key === 'theme') {
        const allWindows = [mainWindow, ...detachedWindows.values()];
        for (const win of allWindows) {
          if (win && !win.isDestroyed()) {
            applyMaterialToWindow(win);
          }
        }
      }
    }
  );

  ipcMain.handle(IPC.SESSION_SAVE, (_event, data: unknown) => {
    sessionStore.set('session', data);
  });

  ipcMain.handle(IPC.CONFIG_OPEN, () => {
    const configPath = configStore!.getPath();
    shell.openPath(configPath);
  });

  ipcMain.handle(IPC.OPEN_PATH, (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  ipcMain.handle(IPC.SESSION_LOAD, () => {
    return sessionStore.get('session', null);
  });

  ipcMain.handle(IPC.DETACH_CREATE, (_event, terminalId: string) => {
    if (detachedWindows.has(terminalId)) {
      const existing = detachedWindows.get(terminalId)!;
      if (!existing.isDestroyed()) {
        existing.focus();
        return;
      }
    }

    const { backgroundMaterial: _dMat, ...detachedConstructorOpts } = getWindowMaterialOpts();
    const detachedWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      title: 'tmax - Terminal',
      autoHideMenuBar: true,
      ...detachedConstructorOpts,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    detachedWin.setMenuBarVisibility(false);

    detachedWin.once('ready-to-show', () => {
      detachedWin.show();
      applyMaterialToWindow(detachedWin);
    });
    detachedWin.on('maximize', () => { applyMaterialToWindow(detachedWin); });
    detachedWin.on('unmaximize', () => { applyMaterialToWindow(detachedWin); });
    detachedWindows.set(terminalId, detachedWin);

    // Open external links in the default browser for detached windows too
    detachedWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    detachedWin.webContents.on('will-navigate', (event, url) => {
      const currentURL = detachedWin.webContents.getURL();
      if (url !== currentURL && (url.startsWith('http://') || url.startsWith('https://'))) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    detachedWin.on('closed', () => {
      detachedWindows.delete(terminalId);
      mainWindow?.webContents.send(IPC.DETACH_CLOSED, terminalId);
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      detachedWin.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?detachedTerminalId=${terminalId}`);
    } else {
      const filePath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
      detachedWin.loadFile(filePath, { query: { detachedTerminalId: terminalId } });
    }
  });

  ipcMain.handle(IPC.DETACH_CLOSE, (_event, terminalId: string) => {
    const win = detachedWindows.get(terminalId);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle(IPC.DETACH_FOCUS, (_event, terminalId: string) => {
    const win = detachedWindows.get(terminalId);
    if (win && !win.isDestroyed()) {
      win.focus();
    }
  });

  // ── Copilot IPC handlers ────────────────────────────────────────────
  ipcMain.handle(IPC.COPILOT_LIST_SESSIONS, () => {
    const native = copilotMonitor?.scanSessions() ?? [];
    const wsl = wslSessionManager?.scanCopilotSessions() ?? [];
    return [...native, ...wsl];
  });

  ipcMain.handle(IPC.COPILOT_GET_SESSION, (_event, id: string) => {
    return copilotMonitor?.getSession(id) ?? wslSessionManager?.getCopilotSession(id) ?? null;
  });

  ipcMain.handle(IPC.COPILOT_SEARCH_SESSIONS, (_event, query: string) => {
    const native = copilotMonitor?.searchSessions(query) ?? [];
    const wsl = wslSessionManager?.searchCopilotSessions(query) ?? [];
    return [...native, ...wsl];
  });

  ipcMain.handle(IPC.COPILOT_START_WATCHING, async () => {
    if (copilotWatcher) {
      await copilotWatcher.start();
    }
  });

  ipcMain.handle(IPC.COPILOT_STOP_WATCHING, async () => {
    if (copilotWatcher) {
      await copilotWatcher.stop();
    }
  });

  ipcMain.handle(IPC.COPILOT_GET_PROMPTS, (_event, id: string) => {
    const native = copilotMonitor?.getPrompts(id) ?? [];
    if (native.length > 0) return native;
    return wslSessionManager?.getCopilotPrompts(id) ?? [];
  });

  // ── Claude Code IPC handlers ──────────────────────────────────────────
  ipcMain.handle(IPC.CLAUDE_CODE_LIST_SESSIONS, () => {
    const native = claudeCodeMonitor?.scanSessions() ?? [];
    const wsl = wslSessionManager?.scanClaudeCodeSessions() ?? [];
    return [...native, ...wsl];
  });

  ipcMain.handle(IPC.CLAUDE_CODE_GET_SESSION, (_event, id: string) => {
    return claudeCodeMonitor?.getSession(id) ?? wslSessionManager?.getClaudeCodeSession(id) ?? null;
  });

  ipcMain.handle(IPC.CLAUDE_CODE_SEARCH_SESSIONS, (_event, query: string) => {
    const native = claudeCodeMonitor?.searchSessions(query) ?? [];
    const wsl = wslSessionManager?.searchClaudeCodeSessions(query) ?? [];
    return [...native, ...wsl];
  });

  ipcMain.handle(IPC.CLAUDE_CODE_START_WATCHING, async () => {
    if (claudeCodeWatcher) {
      await claudeCodeWatcher.start();
    }
  });

  ipcMain.handle(IPC.CLAUDE_CODE_STOP_WATCHING, async () => {
    if (claudeCodeWatcher) {
      await claudeCodeWatcher.stop();
    }
  });

  ipcMain.handle(IPC.CLAUDE_CODE_GET_PROMPTS, (_event, id: string) => {
    const native = claudeCodeMonitor?.getPrompts(id) ?? [];
    if (native.length > 0) return native;
    return wslSessionManager?.getClaudeCodePrompts(id) ?? [];
  });

  // ── Version check IPC handlers ──────────────────────────────────────
  ipcMain.handle(IPC.VERSION_GET_APP_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC.VERSION_GET_UPDATE, () => {
    return versionChecker?.getUpdateInfo() ?? null;
  });

  ipcMain.on(IPC.VERSION_CHECK_NOW, () => {
    versionChecker?.checkNow();
  });

  ipcMain.on(IPC.VERSION_RESTART_AND_UPDATE, () => {
    versionChecker?.restartAndUpdate();
  });

  // ── Transparency IPC handlers ──────────────────────────────────────
  ipcMain.handle(IPC.SET_BACKGROUND_MATERIAL, (_event, material: string) => {
    if (!platformSupportsMaterial()) return;
    const valid: BackgroundMaterial[] = ['none', 'auto', 'mica', 'acrylic', 'tabbed'];
    if (!valid.includes(material as BackgroundMaterial)) return;

    configStore!.set('backgroundMaterial', material as BackgroundMaterial);

    if (mainWindow && !mainWindow.isDestroyed()) {
      applyMaterialToWindow(mainWindow);
    }
    for (const [, win] of detachedWindows) {
      if (!win.isDestroyed()) {
        applyMaterialToWindow(win);
      }
    }
  });

  ipcMain.handle(IPC.GET_PLATFORM_SUPPORTS_MATERIAL, () => {
    return platformSupportsMaterial();
  });

  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, (_event, base64Png: string) => {
    // Re-create if the dir was swept by another instance's startup cleanup
    if (!clipboardTempDir || !fs.existsSync(clipboardTempDir)) {
      clipboardTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmax-clipboard-'));
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 10);
    const filePath = path.join(clipboardTempDir, `clipboard-${timestamp}-${rand}.png`);
    fs.writeFileSync(filePath, Buffer.from(base64Png, 'base64'), { mode: 0o600 });
    return filePath;
  });

  // ── Diff editor IPC handlers ────────────────────────────────────────
  const diffService = new GitDiffService();

  ipcMain.handle(IPC.DIFF_RESOLVE_GIT_ROOT, async (_event, cwd: string) => {
    return resolveGitRoot(cwd);
  });

  ipcMain.handle(IPC.DIFF_GET_CODE_CHANGES, async (_event, cwd: string, mode: DiffMode) => {
    return diffService.getCodeChanges(cwd, mode);
  });

  ipcMain.handle(IPC.DIFF_GET_DIFF, async (_event, cwd: string, mode: DiffMode) => {
    return diffService.getDiff(cwd, mode);
  });

  ipcMain.handle(IPC.DIFF_GET_ANNOTATED_FILE, async (_event, cwd: string, filePath: string, mode: DiffMode) => {
    return diffService.getAnnotatedFile(cwd, filePath, mode);
  });

  // ── Git worktree IPC ────────────────────────────────────────────────
  ipcMain.handle(IPC.GIT_LIST_WORKTREES, async (_event, cwd: string) => {
    return listWorktrees(cwd);
  });
  ipcMain.handle(IPC.GIT_CREATE_WORKTREE, async (_event, repoPath: string, branchName: string, baseBranch: string) => {
    return createWorktree(repoPath, branchName, baseBranch);
  });
  ipcMain.handle(IPC.GIT_DELETE_WORKTREE, async (_event, repoPath: string, worktreePath: string) => {
    return deleteWorktree(repoPath, worktreePath);
  });
  ipcMain.handle(IPC.GIT_GET_BRANCHES, async (_event, repoPath: string) => {
    return getBranches(repoPath);
  });

  // ── File explorer IPC ──────────────────────────────────────────────
  ipcMain.handle(IPC.FILE_LIST, async (_event, dirPath: string, wslDistro?: string) => {
    try {
      // For WSL terminals, translate Linux paths to UNC paths for fs access
      let fsPath = dirPath;
      if (wslDistro && dirPath.startsWith('/')) {
        if (!/^[\w][\w.\-]*$/.test(wslDistro)) return [];
        fsPath = `\\\\wsl.localhost\\${wslDistro}${dirPath.replace(/\//g, '\\')}`;
      }
      const entries = fs.readdirSync(fsPath, { withFileTypes: true });
      return entries
        .map((e: any) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          // Return Linux-style paths for WSL so the explorer stays consistent
          path: wslDistro ? dirPath.replace(/\/$/, '') + '/' + e.name : path.join(dirPath, e.name),
        }))
        .sort((a: any, b: any) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC.FILE_READ, async (_event, filePath: string, wslDistro?: string) => {
    try {
      let fsPath = filePath;
      if (wslDistro && filePath.startsWith('/')) {
        if (!/^[\w][\w.\-]*$/.test(wslDistro)) return null;
        fsPath = `//wsl.localhost/${wslDistro}${filePath}`;
      }
      const stat = fs.statSync(fsPath);
      // Only read text files under 1MB
      if (stat.size > 1024 * 1024) return null;
      const content = fs.readFileSync(fsPath, 'utf-8');
      // Check if content looks like binary
      if (content.includes('\0')) return null;
      return content;
    } catch {
      return null;
    }
  });
}

function setupCopilotMonitor(): void {
  copilotMonitor = new CopilotSessionMonitor();

  copilotMonitor.setCallbacks({
    onSessionUpdated(session) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_UPDATED, session);
      notifyCopilotSession(session);
    },
    onSessionAdded(session) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_ADDED, session);
    },
    onSessionRemoved(sessionId) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_REMOVED, sessionId);
    },
  });

  copilotWatcher = new CopilotSessionWatcher(copilotMonitor.getBasePath(), {
    onEventsChanged(sessionId) {
      copilotMonitor!.handleEventsChanged(sessionId);
    },
    onNewSession(sessionId) {
      copilotMonitor!.handleNewSession(sessionId);
    },
    onSessionRemoved(sessionId) {
      copilotMonitor!.handleSessionRemoved(sessionId);
    },
  });

  copilotWatcher.setStaleCheckCallback(() => {
    // Re-scan all sessions periodically to catch stale states
    copilotMonitor!.scanSessions();
  });
}

function setupClaudeCodeMonitor(): void {
  claudeCodeMonitor = new ClaudeCodeSessionMonitor();

  claudeCodeMonitor.setCallbacks({
    onSessionUpdated(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_UPDATED, session);
    },
    onSessionAdded(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_ADDED, session);
    },
    onSessionRemoved(sessionId) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_REMOVED, sessionId);
    },
  });

  claudeCodeWatcher = new ClaudeCodeSessionWatcher(claudeCodeMonitor.getBasePath(), {
    onFileChanged(filePath) {
      claudeCodeMonitor!.handleFileChanged(filePath);
    },
    onNewFile(filePath) {
      claudeCodeMonitor!.handleNewFile(filePath);
    },
    onFileRemoved(filePath) {
      claudeCodeMonitor!.handleFileRemoved(filePath);
    },
  });

  claudeCodeWatcher.setStaleCheckCallback(() => {
    claudeCodeMonitor!.scanSessions();
  });
}

async function setupWslSessionManager(): Promise<void> {
  if (process.platform !== 'win32') return;

  wslSessionManager = new WslSessionManager();

  wslSessionManager.setCallbacks({
    onCopilotSessionUpdated(session) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_UPDATED, session);
      notifyCopilotSession(session);
    },
    onCopilotSessionAdded(session) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_ADDED, session);
    },
    onCopilotSessionRemoved(sessionId) {
      mainWindow?.webContents.send(IPC.COPILOT_SESSION_REMOVED, sessionId);
    },
    onClaudeCodeSessionUpdated(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_UPDATED, session);
    },
    onClaudeCodeSessionAdded(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_ADDED, session);
    },
    onClaudeCodeSessionRemoved(sessionId) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_REMOVED, sessionId);
    },
  });

  await wslSessionManager.start();
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

app.whenReady().then(() => {
  try {
    // Purge leftover clipboard temp dirs from crashed/killed sessions
    sweepStaleClipboardDirs();

    // Force dark title bar/frame regardless of Windows system theme
    nativeTheme.themeSource = 'dark';

    // On macOS, a null menu creates default accelerators (Cmd+C/V/X) that
    // intercept events before the renderer. Use a minimal menu instead.
    if (process.platform === 'darwin') {
      const macMenu = Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
      ]);
      Menu.setApplicationMenu(macMenu);
    } else {
      Menu.setApplicationMenu(null);
    }
    initDiagLogger();
    setupConfigStore();
    console.log('Config store ready');
    setupPtyManager();
    console.log('PTY manager ready');
    setupCopilotMonitor();
    console.log('Copilot monitor ready');
    setupClaudeCodeMonitor();
    console.log('Claude Code monitor ready');
    createWindow();
    console.log('Window created');
    registerIpcHandlers();
    console.log('IPC handlers registered');
    versionChecker = new VersionChecker(mainWindow!);
    versionChecker.start();
    console.log('Version checker started');
    // Start WSL discovery after window is visible — WSL distro detection
    // uses synchronous subprocess calls that can block for several seconds
    setupWslSessionManager().then(() => {
      console.log('WSL session manager ready');
    }).catch((err) => {
      console.error('WSL session manager failed:', err);
    });
  } catch (error) {
    console.error('Startup error:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Keep ConPTY pipes alive during screen lock by periodically resizing
  let lockPingInterval: ReturnType<typeof setInterval> | null = null;

  powerMonitor.on('lock-screen', () => {
    diagLog('system:lock-screen');
    console.log('Screen locked, starting PTY keep-alive pings');
    if (lockPingInterval) clearInterval(lockPingInterval);
    lockPingInterval = setInterval(() => {
      ptyManager?.resizeAll();
    }, 30000); // ping every 30 seconds
  });

  powerMonitor.on('unlock-screen', () => {
    diagLog('system:unlock-screen');
    console.log('Screen unlocked, stopping keep-alive pings');
    if (lockPingInterval) {
      clearInterval(lockPingInterval);
      lockPingInterval = null;
    }
    // One final resize to wake everything up
    ptyManager?.resizeAll();
  });

  // Wake up ConPTY processes after system resume from sleep/hibernate
  powerMonitor.on('resume', () => {
    diagLog('system:resume');
    console.log('System resumed from sleep, pinging all PTYs');
    if (lockPingInterval) {
      clearInterval(lockPingInterval);
      lockPingInterval = null;
    }
    ptyManager?.resizeAll();
  });
});

app.on('window-all-closed', async () => {
  // Clean up clipboard temp dir
  if (clipboardTempDir) {
    try { fs.rmSync(clipboardTempDir, { recursive: true }); } catch { /* ignore */ }
  }
  ptyManager?.killAll();
  await copilotWatcher?.stop();
  copilotMonitor?.dispose();
  await claudeCodeWatcher?.stop();
  claudeCodeMonitor?.dispose();
  await wslSessionManager?.stop();
  versionChecker?.stop();
  clearNotificationCooldowns();
  app.quit();
});
