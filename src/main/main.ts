import { app, BrowserWindow, ipcMain, Menu, powerMonitor, session, shell } from 'electron';
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
import { VersionChecker } from './version-checker';
import { initDiagLogger, getDiagLogPath, diagLog } from './diag-logger';
import { GitDiffService, resolveGitRoot } from './git-diff-service';
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

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let configStore: ConfigStore | null = null;
let copilotMonitor: CopilotSessionMonitor | null = null;
let copilotWatcher: CopilotSessionWatcher | null = null;
let claudeCodeMonitor: ClaudeCodeSessionMonitor | null = null;
let claudeCodeWatcher: ClaudeCodeSessionWatcher | null = null;
let versionChecker: VersionChecker | null = null;
let clipboardTempDir: string | null = null;
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
  const materialOpts = getWindowMaterialOpts();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    show: false,
    title: 'tmax',
    icon: path.join(__dirname, '../../assets/icon.png'),
    autoHideMenuBar: true,
    ...materialOpts,
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

    // Force DWM to repaint the non-client area (title bar) so the old-style
    // Win32 chrome is replaced by the themed frame when a background material
    // (mica / acrylic / tabbed) is active.
    if (materialOpts.backgroundMaterial) {
      (mainWindow as any).setBackgroundMaterial(materialOpts.backgroundMaterial);
    }
  });

  // Prevent Chromium's built-in zoom — reset zoom level after any zoom attempt
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && !input.shift && !input.alt) {
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
    (_event, opts: { id: string; shellPath: string; args: string[]; cwd: string; env?: Record<string, string>; cols: number; rows: number }) => {
      // Validate shell path against configured profiles to prevent arbitrary exec
      const shells = configStore!.get('shells');
      const profile = shells.find((s: { path: string }) => s.path === opts.shellPath);
      if (!profile) {
        throw new Error(`Shell path not in configured profiles: ${opts.shellPath}`);
      }
      // Clamp cols/rows to reasonable bounds
      const cols = Math.max(1, Math.min(500, opts.cols || 80));
      const rows = Math.max(1, Math.min(200, opts.rows || 24));
      return ptyManager!.create({ ...opts, args: profile.args, cols, rows });
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

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configStore!.getAll();
  });

  ipcMain.handle(
    IPC.CONFIG_SET,
    (_event, key: string, value: unknown) => {
      configStore!.set(key as keyof ReturnType<ConfigStore['getAll']>, value as never);

      // Dynamically apply background material changes
      if (key === 'backgroundMaterial' || key === 'backgroundOpacity' || key === 'theme') {
        const material = (configStore!.get('backgroundMaterial') || 'none') as BackgroundMaterial;
        const opacity = configStore!.get('backgroundOpacity') as number ?? 0.8;
        const themeBg = configStore!.get('theme')?.background || '#1e1e2e';
        const allWindows = [mainWindow, ...detachedWindows.values()];
        for (const win of allWindows) {
          if (win && !win.isDestroyed() && platformSupportsMaterial()) {
            (win as any).setBackgroundMaterial(material);
            if (material !== 'none') {
              win.setBackgroundColor(hexWithAlpha(themeBg, opacity));
            } else {
              win.setBackgroundColor(themeBg);
            }
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

    const detachedMaterialOpts = getWindowMaterialOpts();
    const detachedWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      title: 'tmax - Terminal',
      autoHideMenuBar: true,
      ...detachedMaterialOpts,
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
      // Force DWM to repaint the title bar when a background material is active
      if (detachedMaterialOpts.backgroundMaterial) {
        (detachedWin as any).setBackgroundMaterial(detachedMaterialOpts.backgroundMaterial);
      }
    });
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
    return copilotMonitor?.scanSessions() ?? [];
  });

  ipcMain.handle(IPC.COPILOT_GET_SESSION, (_event, id: string) => {
    return copilotMonitor?.getSession(id) ?? null;
  });

  ipcMain.handle(IPC.COPILOT_SEARCH_SESSIONS, (_event, query: string) => {
    return copilotMonitor?.searchSessions(query) ?? [];
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
    return copilotMonitor?.getPrompts(id) ?? [];
  });

  // ── Claude Code IPC handlers ──────────────────────────────────────────
  ipcMain.handle(IPC.CLAUDE_CODE_LIST_SESSIONS, () => {
    return claudeCodeMonitor?.scanSessions() ?? [];
  });

  ipcMain.handle(IPC.CLAUDE_CODE_GET_SESSION, (_event, id: string) => {
    return claudeCodeMonitor?.getSession(id) ?? null;
  });

  ipcMain.handle(IPC.CLAUDE_CODE_SEARCH_SESSIONS, (_event, query: string) => {
    return claudeCodeMonitor?.searchSessions(query) ?? [];
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
    return claudeCodeMonitor?.getPrompts(id) ?? [];
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
    const mat = material as BackgroundMaterial;

    // Persist to config
    configStore!.set('backgroundMaterial', mat);

    const opacity = configStore?.get('backgroundOpacity') as number ?? 0.8;
    const themeBg = configStore?.get('theme')?.background || '#1e1e2e';

    // Apply to main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      (mainWindow as any).setBackgroundMaterial(mat);
      if (mat !== 'none') {
        mainWindow.setBackgroundColor(hexWithAlpha(themeBg, opacity));
      } else {
        mainWindow.setBackgroundColor(themeBg);
      }
    }
    // Apply to all detached windows
    for (const [, win] of detachedWindows) {
      if (!win.isDestroyed()) {
        (win as any).setBackgroundMaterial(mat);
        if (mat !== 'none') {
          win.setBackgroundColor(hexWithAlpha(themeBg, opacity));
        } else {
          win.setBackgroundColor(themeBg);
        }
      }
    }
  });

  ipcMain.handle(IPC.GET_PLATFORM_SUPPORTS_MATERIAL, () => {
    return platformSupportsMaterial();
  });

  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, (_event, base64Png: string) => {
    if (!clipboardTempDir) {
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

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

app.whenReady().then(() => {
  try {
    Menu.setApplicationMenu(null);
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
  } catch (error) {
    console.error('Startup error:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Wake up ConPTY processes after system resume from sleep/hibernate
  powerMonitor.on('resume', () => {
    diagLog('system:resume');
    console.log('System resumed from sleep, pinging all PTYs');
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
  versionChecker?.stop();
  clearNotificationCooldowns();
  app.quit();
});
