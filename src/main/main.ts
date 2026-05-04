import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, net, powerMonitor, session, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Store from 'electron-store';
import { PtyManager } from './pty-manager';
import { ConfigStore, defaultConfig } from './config-store';
import type { BackgroundMaterial, Keybinding } from './config-store';
import { KeybindingsFile } from './keybindings-file';
import { IPC } from '../shared/ipc-channels';
import { CopilotSessionMonitor } from './copilot-session-monitor';
import { CopilotSessionWatcher } from './copilot-session-watcher';
import { notifyCopilotSession, clearNotificationCooldowns, setAiSessionNotificationsEnabled, setNotificationClickHandler, setSessionNameOverrides } from './copilot-notification';
import { ClaudeCodeSessionMonitor } from './claude-code-session-monitor';
import { ClaudeCodeSessionWatcher } from './claude-code-session-watcher';
import { WslSessionManager } from './wsl-session-manager';
import { VersionChecker } from './version-checker';
import { initDiagLogger, getDiagLogPath, diagLog, sanitize } from './diag-logger';
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
let keybindingsFile: KeybindingsFile | null = null;
let copilotMonitor: CopilotSessionMonitor | null = null;
let copilotWatcher: CopilotSessionWatcher | null = null;
let claudeCodeMonitor: ClaudeCodeSessionMonitor | null = null;
let claudeCodeWatcher: ClaudeCodeSessionWatcher | null = null;
let wslSessionManager: WslSessionManager | null = null;
let versionChecker: VersionChecker | null = null;
let clipboardTempDir: string | null = null;
const CLIPBOARD_FILE_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Stable shared clipboard temp dir, e.g. `<tmpdir>/tmax-clipboard`. Using a
 * stable name (no random suffix) means image paths inserted into the terminal
 * stay valid across tmax restarts - the image-path link provider can still
 * open them when the user clicks the path days later. Per-file random names
 * keep concurrent instances isolated; per-file 0o600 keeps them non-readable
 * to other users.
 */
function getClipboardDir(): string {
  return path.join(os.tmpdir(), 'tmax-clipboard');
}

/**
 * Sweep individual clipboard files older than 6 hours. Called once on
 * startup. Used to nuke the whole dir on shutdown, but that broke the
 * image-path click feature: closing tmax invalidated every clipboard image
 * path still rendered in the scrollback. Now we only delete *files*, and
 * only ones that have been on disk long enough that the user is unlikely
 * to still want them. Also removes legacy per-process `tmax-clipboard-*`
 * dirs left behind by older builds.
 */
function sweepStaleClipboardDirs(): void {
  try {
    const tmp = os.tmpdir();
    const now = Date.now();
    const stableDir = getClipboardDir();
    // Legacy per-session dirs from before the stable-dir refactor.
    for (const name of fs.readdirSync(tmp)) {
      if (!name.startsWith('tmax-clipboard-')) continue;
      const full = path.join(tmp, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isDirectory()) continue;
        fs.rmSync(full, { recursive: true, force: true });
      } catch { /* skip locked or inaccessible dirs */ }
    }
    // Per-file sweep inside the stable dir.
    if (fs.existsSync(stableDir)) {
      for (const name of fs.readdirSync(stableDir)) {
        const full = path.join(stableDir, name);
        try {
          const stat = fs.statSync(full);
          if (!stat.isFile()) continue;
          if (now - stat.mtimeMs < CLIPBOARD_FILE_STALE_MS) continue;
          fs.rmSync(full, { force: true });
        } catch { /* skip */ }
      }
    }
  } catch { /* tmp listing failed - ignore */ }
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
  // Allow the renderer to fetch from GitHub's API (release notes modal, etc.).
  // api.github.com is Microsoft-controlled and returns CORS-friendly responses.
  const connectSrc = isDev
    ? "connect-src 'self' https://api.github.com ws://localhost:* http://localhost:*"
    : "connect-src 'self' https://api.github.com";
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

    if (process.env.TMAX_E2E === '1') {
      // Playwright launches mid-workday and the test windows used to pop up
      // over whatever the user was doing, stealing focus. In E2E mode show
      // the window inactive, off-screen, and out of the taskbar.
      mainWindow!.setPosition(-3000, -3000);
      mainWindow!.setSize(1200, 800);
      mainWindow!.setSkipTaskbar(true);
      mainWindow!.showInactive();
    } else {
      mainWindow!.maximize();
      mainWindow!.show();
      mainWindow!.focus();
    }

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
    // Re-bind DevTools - the default Ctrl+Shift+I path goes through the
    // application menu, which we strip via Menu.setApplicationMenu(null).
    // Without this, there's no way to open the inspector at all.
    if (primaryMod && input.shift && !input.alt && (input.key === 'I' || input.key === 'i')) {
      mainWindow!.webContents.toggleDevTools();
    }
    if (input.key === 'F12' && !primaryMod && !input.shift && !input.alt) {
      mainWindow!.webContents.toggleDevTools();
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

  // TASK-58 diagnostic: write main-process URL handler firings to a log file
  // because packaged tmax.bat has no visible stdout. Path will print via IPC
  // to the renderer console too.
  const task58LogPath = require('path').join(require('os').tmpdir(), 'tmax-task58.log');
  const task58Log = (msg: string, data: unknown) => {
    const line = `[${new Date().toISOString()}] ${msg} ${JSON.stringify(data)}\n`;
    try { require('fs').appendFileSync(task58LogPath, line); } catch { /* noop */ }
    console.warn('[tmax TASK-58]', msg, data);
  };
  task58Log('LOG INIT - clicks below this line', { logPath: task58LogPath });

  // External link handling. Returning {action: 'deny'} cancels the new
  // BrowserWindow; we then route http(s) URLs to the default browser via
  // shell.openExternal. An older comment claimed Electron auto-fell-through
  // to external open after deny, making the explicit call a double-open -
  // diagnostic logging (tmax-task58.log) showed that's no longer true: in
  // Electron 30 a denied window.open fires neither will-navigate nor
  // did-create-window, so without this call the URL is silently dropped.
  // That manifested as "click does nothing" inside Claude Code panes
  // (TASK-106). Guard the scheme to keep file:// / mailto: / custom-scheme
  // links from triggering an unintended browser open.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    task58Log('setWindowOpenHandler fired', { url });
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow?.webContents.getURL();
    task58Log('will-navigate fired', { url, currentURL });
    // Block in-frame navigation away from our renderer. Electron does NOT
    // auto-fallback to external for preventDefault'd will-navigate (unlike
    // the deny path above), so we route http(s) to shell.openExternal here.
    if (url !== currentURL && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Also catch new windows being created (in case some other path bypasses
  // setWindowOpenHandler) and any did-create-window event for instrumentation.
  mainWindow.webContents.on('did-create-window', (childWin, details) => {
    task58Log('did-create-window fired', { url: details.url });
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
  // TASK-64: propagate the AI-session-notifications opt-out to the
  // notification module. Default true; users running an external hook
  // plugin can disable in tmax-config.json without restarting their
  // notification stack.
  setAiSessionNotificationsEnabled(configStore.get('aiSessionNotifications') ?? true);
}

// TASK-71: seed the notification module's override cache directly from
// the on-disk session store at startup. Without this, the very first
// notification of the run (which can fire before the renderer has had a
// chance to send SESSION_NAME_OVERRIDES_SYNC) would still show the auto-
// derived name even for previously-renamed sessions.
function seedSessionNameOverridesFromDisk(): void {
  try {
    const session = sessionStore.get('session') as Record<string, unknown> | undefined;
    const raw = session?.sessionNameOverrides;
    if (!raw || typeof raw !== 'object') return;
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) map[k] = v;
    }
    setSessionNameOverrides(map);
  } catch {
    // Session store unreadable at startup - non-fatal; renderer will sync
    // a fresh map shortly after it boots.
  }
}

// Action ids that the renderer's keybindings runtime knows how to dispatch.
// Documented in the keybindings.json header so users discover what's bindable
// without reading source. (TASK-39)
const KEYBINDING_ACTIONS = [
  'createTerminal',
  'closeTerminal',
  'focusUp',
  'focusDown',
  'focusLeft',
  'focusRight',
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'splitHorizontal',
  'splitVertical',
  'toggleFloat',
  'toggleFocusMode',
  'toggleBroadcast',
  'toggleTabBar',
  'toggleCopilotPanel',
  'commandPalette',
  'paneHints',
  'jumpToTerminal',
  'renamePane',
  'showPrompts',
  'searchPrompts',
  'hidePane',
  'zoomIn',
  'zoomOut',
  'zoomReset',
  // Workspaces (TASK-40)
  'newWorkspace',
  'nextWorkspace',
  'prevWorkspace',
  'goToWorkspace1',
  'goToWorkspace2',
  'goToWorkspace3',
  'goToWorkspace4',
  'goToWorkspace5',
  'goToWorkspace6',
  'goToWorkspace7',
  'goToWorkspace8',
  'goToWorkspace9',
];

function setupKeybindingsFile(): void {
  if (!configStore) return;
  const userDataDir = app.getPath('userData');
  keybindingsFile = new KeybindingsFile(userDataDir, KEYBINDING_ACTIONS);
  // Seed the file from the legacy config keybindings on first launch with the
  // new system. After that, the file is authoritative; the legacy field is
  // left in place but ignored.
  const seed: Keybinding[] = configStore.get('keybindings') as Keybinding[];
  const initial = keybindingsFile.init(seed, (msg) => console.warn(`[keybindings] ${msg}`));
  // Reflect the parsed file back into the in-process config so the renderer's
  // first CONFIG_GET picks it up without a separate fetch.
  configStore.set('keybindings', initial);

  keybindingsFile.onChange((bindings) => {
    if (!configStore) return;
    configStore.set('keybindings', bindings);
    // Push the new bindings to all renderer windows so the keymap rebinds
    // without an app restart.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.KEYBINDINGS_CHANGED, bindings);
    }
  });
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

      // TASK-64 settings UI: propagate the toggle to the runtime gate so
      // disabling notifications in Settings takes effect immediately
      // without restarting the app.
      if (key === 'aiSessionNotifications') {
        setAiSessionNotificationsEnabled(value !== false);
      }

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

  // TASK-71: receive the user-set pane title overrides from the renderer
  // so notifyCopilotSession can prefer them over the auto-derived
  // session.summary. The renderer fires this on every rename (and once
  // after restoreSession). Main also seeds the cache from sessionStore
  // at startup - see seedSessionNameOverridesFromDisk.
  ipcMain.on(IPC.SESSION_NAME_OVERRIDES_SYNC, (_event, overrides: unknown) => {
    if (!overrides || typeof overrides !== 'object') {
      setSessionNameOverrides({});
      return;
    }
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) map[k] = v;
    }
    setSessionNameOverrides(map);
  });

  ipcMain.handle(IPC.CONFIG_OPEN, () => {
    const configPath = configStore!.getPath();
    shell.openPath(configPath);
  });

  // ── Keybindings file (TASK-39) ───────────────────────────────────────
  ipcMain.handle(IPC.KEYBINDINGS_GET, () => {
    return keybindingsFile?.read() ?? configStore!.get('keybindings');
  });
  ipcMain.handle(IPC.KEYBINDINGS_OPEN_FILE, () => {
    if (keybindingsFile) shell.openPath(keybindingsFile.getPath());
  });
  ipcMain.handle(IPC.KEYBINDINGS_RESET, () => {
    if (!keybindingsFile || !configStore) return [];
    const bindings = keybindingsFile.resetToDefaults(defaultConfig.keybindings);
    configStore.set('keybindings', bindings);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.KEYBINDINGS_CHANGED, bindings);
    }
    return bindings;
  });

  // Extensions that can execute code when opened via shell.openPath. Opens
  // of documents / URLs / directories still pass through - this is a tight
  // blocklist, not an allowlist. Defense-in-depth against a compromised
  // renderer: even though the renderer already has PTY access, narrowing
  // this surface still kills the "one IPC call → arbitrary exe launch"
  // shortcut.
  const DANGEROUS_OPEN_EXTENSIONS = new Set([
    // Windows executables and shell scripts
    '.exe', '.bat', '.cmd', '.ps1', '.msi', '.com', '.scr', '.pif',
    // Script hosts and shortcuts
    '.lnk', '.hta', '.vbs', '.vbe', '.jse', '.wsf', '.wsh',
    // Config / snap-ins that can run code
    '.reg', '.msc', '.cpl', '.chm',
    // Unix-ish executables and bundles
    '.sh', '.app', '.command',
    // Auto-executing archives / scripts
    '.jar', '.py', '.pyw',
  ]);

  ipcMain.handle(IPC.OPEN_PATH, (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) return;
    const ext = path.extname(filePath).toLowerCase();
    if (DANGEROUS_OPEN_EXTENSIONS.has(ext)) {
      diagLog('security:open-path-blocked', { ext, path: sanitize(filePath) });
      return;
    }
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

    // Open external links in the default browser for detached windows too.
    // Mirror the main-window handler: deny the new BrowserWindow, then call
    // shell.openExternal explicitly for http(s) - Electron 30's deny path
    // does not auto-fall-through to will-navigate.
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
  ipcMain.handle(IPC.COPILOT_LIST_SESSIONS, async (_event, limit?: number) => {
    const cap = limit ?? 50;
    const native = await copilotMonitor?.scanSessions(cap) ?? [];
    const wsl = await wslSessionManager?.scanCopilotSessions(cap) ?? [];
    // Apply the cap to the combined (native + WSL) list, sorted by recency,
    // so the user-facing limit is honored across both sources.
    const combined = [...native, ...wsl]
      .sort((a, b) => (b.lastActivityTime ?? 0) - (a.lastActivityTime ?? 0))
      .slice(0, cap);
    const totalEligible = (copilotMonitor?.lastTotalEligible ?? 0) + wsl.length;
    return { sessions: combined, totalEligible };
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

  ipcMain.handle(IPC.AI_INVALIDATE_CACHES, () => {
    copilotMonitor?.invalidateCache();
    claudeCodeMonitor?.invalidateCache();
  });

  // ── Claude Code IPC handlers ──────────────────────────────────────────
  ipcMain.handle(IPC.CLAUDE_CODE_LIST_SESSIONS, async (_event, limit?: number) => {
    const cap = limit ?? 50;
    const native = await claudeCodeMonitor?.scanSessions(cap) ?? [];
    const wsl = await wslSessionManager?.scanClaudeCodeSessions(cap) ?? [];
    // Apply the cap to the combined (native + WSL) list, sorted by recency,
    // so the user-facing limit is honored across both sources.
    const combined = [...native, ...wsl]
      .sort((a, b) => (b.lastActivityTime ?? 0) - (a.lastActivityTime ?? 0))
      .slice(0, cap);
    const totalEligible = (claudeCodeMonitor?.lastTotalEligible ?? 0) + wsl.length;
    return { sessions: combined, totalEligible };
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

  ipcMain.handle(IPC.VERSION_GET_CHANGELOG, async () => {
    try {
      const res = await net.fetch('https://raw.githubusercontent.com/InbarR/tmax/main/CHANGELOG.md');
      return res.ok ? await res.text() : '';
    } catch {
      return '';
    }
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
    // Stable dir: paths stay clickable across restarts. Per-file random
    // names mean concurrent instances don't collide.
    if (!clipboardTempDir) clipboardTempDir = getClipboardDir();
    if (!fs.existsSync(clipboardTempDir)) {
      fs.mkdirSync(clipboardTempDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 10);
    const filePath = path.join(clipboardTempDir, `clipboard-${timestamp}-${rand}.png`);
    fs.writeFileSync(filePath, Buffer.from(base64Png, 'base64'), { mode: 0o600 });
    return filePath;
  });

  // Resolve a bare clipboard-image basename to its full path. Copilot CLI's
  // input box hides the directory part of pasted paths and shows just
  // `[clipboard-...png]`, so the link provider can only see the basename.
  // We probe the stable clipboard temp dir on disk - no cache, no stale
  // entries; just check if the file is actually there right now.
  ipcMain.handle(IPC.RESOLVE_CLIPBOARD_BASENAME, async (_event, basename: string) => {
    try {
      // Defense-in-depth: refuse anything that looks like a path. The
      // renderer is expected to send a bare filename only.
      if (!basename || /[\\/]/.test(basename) || basename === '.' || basename === '..') return null;
      const dir = getClipboardDir();
      const full = path.join(dir, basename);
      if (!fs.existsSync(full)) return null;
      return full;
    } catch {
      return null;
    }
  });

  // Read an image file off disk and return a base64 data URL. Used by the
  // in-tmax image preview overlay (TASK-70 follow-up): file:// URLs from
  // the renderer are blocked when the renderer origin is http://localhost
  // (Vite dev), so we round-trip the bytes through IPC instead.
  ipcMain.handle(IPC.IMAGE_READ_DATA_URL, async (_event, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
      };
      const mime = mimeMap[ext];
      if (!mime) return null;
      const stat = fs.statSync(filePath);
      // Hard ceiling so a stray 1 GB tiff doesn't OOM the renderer.
      if (stat.size > 50 * 1024 * 1024) return null;
      const buf = fs.readFileSync(filePath);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
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

  // Translate logical path (Windows or WSL Linux) to a fs-accessible path.
  function toFsPath(logicalPath: string, wslDistro?: string): string | null {
    if (wslDistro && logicalPath.startsWith('/')) {
      if (!/^[\w][\w.\-]*$/.test(wslDistro)) return null;
      return `\\\\wsl.localhost\\${wslDistro}${logicalPath.replace(/\//g, '\\')}`;
    }
    return logicalPath;
  }

  ipcMain.handle(IPC.FILE_REVEAL, async (_event, filePath: string, wslDistro?: string) => {
    try {
      const fsPath = toFsPath(filePath, wslDistro);
      if (!fsPath) return { ok: false, error: 'Invalid path' };
      // showItemInFolder is silent on Windows if the file is missing — stat
      // first so we can return a real error instead of a no-op.
      try { fs.statSync(fsPath); } catch { return { ok: false, error: `Path not found: ${fsPath}` }; }
      console.log('[FILE_REVEAL]', fsPath);
      shell.showItemInFolder(fsPath);
      return { ok: true };
    } catch (e) {
      console.error('[FILE_REVEAL] error:', e);
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.FILE_RENAME, async (_event, oldPath: string, newName: string, wslDistro?: string) => {
    try {
      // Validate the new name: no path separators, no traversal.
      if (!newName || /[\\/]/.test(newName) || newName === '.' || newName === '..') {
        return { ok: false, error: 'Invalid name' };
      }
      const fsOld = toFsPath(oldPath, wslDistro);
      if (!fsOld) return { ok: false, error: 'Invalid path' };
      const dir = path.dirname(fsOld);
      const fsNew = path.join(dir, newName);
      if (fs.existsSync(fsNew)) return { ok: false, error: 'A file with that name already exists' };
      fs.renameSync(fsOld, fsNew);
      // Build the logical (caller-style) new path for the renderer.
      let newLogical: string;
      if (wslDistro && oldPath.startsWith('/')) {
        const lastSlash = oldPath.lastIndexOf('/');
        newLogical = oldPath.slice(0, lastSlash + 1) + newName;
      } else {
        newLogical = path.join(path.dirname(oldPath), newName);
      }
      return { ok: true, newPath: newLogical };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.FILE_DELETE, async (_event, filePath: string, wslDistro?: string) => {
    try {
      const fsPath = toFsPath(filePath, wslDistro);
      if (!fsPath) return { ok: false, error: 'Invalid path' };
      console.log('[FILE_DELETE]', fsPath);
      // shell.trashItem moves to Recycle Bin / Trash — recoverable, much safer
      // than fs.unlink/rmdir.
      await shell.trashItem(fsPath);
      console.log('[FILE_DELETE] ok');
      return { ok: true };
    } catch (e) {
      console.error('[FILE_DELETE] error:', e);
      return { ok: false, error: (e as Error).message };
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
    // Only refresh already-loaded sessions — no full directory re-scan
    copilotMonitor!.refreshLoadedSessions();
  });
}

function setupClaudeCodeMonitor(): void {
  claudeCodeMonitor = new ClaudeCodeSessionMonitor();

  claudeCodeMonitor.setCallbacks({
    onSessionUpdated(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_UPDATED, session);
      // TASK-64: Claude Code finishes a turn -> parser flips status to
      // waitingForUser. The shared notify path treats that as "session
      // ready / needs attention" and surfaces an OS notification, with
      // a 30 s per-session cooldown.
      notifyCopilotSession(session);
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
    claudeCodeMonitor!.refreshLoadedSessions();
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
      // TASK-64: same notify wiring as the local Claude Code monitor.
      notifyCopilotSession(session);
    },
    onClaudeCodeSessionAdded(session) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_ADDED, session);
    },
    onClaudeCodeSessionRemoved(sessionId) {
      mainWindow?.webContents.send(IPC.CLAUDE_CODE_SESSION_REMOVED, sessionId);
    },
  });

  // Pass the user's aiSessionLoadLimit so the boot-time WSL scan honors it.
  // Without this, an uncapped initial scan fires onSessionAdded for every
  // WSL session and the renderer's load-with-cap result gets swamped by
  // the side-channel events (TASK-3 / TASK-104).
  const cfgLimit = (configStore?.getAll() as any)?.aiSessionLoadLimit;
  const initialLimit = typeof cfgLimit === 'number' && cfgLimit >= 0 ? cfgLimit : 314;
  await wslSessionManager.start(initialLimit);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

app.whenReady().then(() => {
  try {
    // TASK-69: pin the Windows appUserModelID so OS toast notifications
    // (e.g. the TASK-64 "Claude Code: Session Ready" alert) attribute to
    // "tmax" instead of Electron's default "electron.app.Electron".
    // Squirrel's shortcut convention is `com.squirrel.<AppName>.<ExeName>`;
    // matching it here means installed and dev runs share an identity.
    // No-op on macOS / Linux.
    if (process.platform === 'win32') {
      try { app.setAppUserModelId('com.squirrel.tmax.tmax'); } catch { /* noop */ }
    }

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
    seedSessionNameOverridesFromDisk();
    if (process.env.TMAX_E2E === '1') {
      // TASK-71: expose a few notification helpers on `global` so e2e tests
      // can drive notifyCopilotSession directly via app.evaluate without
      // having to spin up the real session monitor and watch a fake JSONL
      // file being written.
      (global as any).__notifyCopilotSession = notifyCopilotSession;
      (global as any).__clearNotificationCooldowns = clearNotificationCooldowns;
    }
    setupKeybindingsFile();
    setupPtyManager();
    console.log('PTY manager ready');
    setupCopilotMonitor();
    console.log('Copilot monitor ready');
    setupClaudeCodeMonitor();
    console.log('Claude Code monitor ready');
    createWindow();
    console.log('Window created');

    // Click on a tmax OS notification toast → bring tmax to the front. Same
    // restore/show/focus dance as the global show-window hotkey below.
    setNotificationClickHandler(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    });

    // Global "show tmax" hotkey (works even when the window is minimized or
    // another app is focused). Default: Ctrl+Shift+Space; override via config
    // key `showWindowHotkey`. Unregistering is handled by `will-quit`.
    const cfg = configStore?.getAll() as any;
    // Users can set showWindowHotkey to an empty string in Settings to
    // disable the global shortcut entirely (useful if it clashes with
    // another tool). `undefined` / unset falls back to the default.
    const rawHotkey = cfg?.showWindowHotkey;
    const showHotkey: string = rawHotkey === '' ? '' : (rawHotkey || 'CommandOrControl+Shift+Space');
    if (showHotkey) {
      try {
        const ok = globalShortcut.register(showHotkey, () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
        });
        if (!ok) console.warn(`[hotkey] failed to register ${showHotkey} (already taken?)`);
        else console.log(`[hotkey] show-tmax registered: ${showHotkey}`);
      } catch (err) {
        console.warn('[hotkey] register threw:', err);
      }
    } else {
      console.log('[hotkey] show-tmax disabled (empty showWindowHotkey)');
    }

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

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
});

app.on('window-all-closed', async () => {
  // Note: we deliberately do NOT delete the clipboard temp dir here. Image
  // paths inserted into the terminal stay clickable across restarts only
  // if the files survive the close. Stale files are reaped by the 6h
  // per-file sweep in sweepStaleClipboardDirs() on next startup.
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
