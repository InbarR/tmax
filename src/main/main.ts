import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { PtyManager } from './pty-manager';
import { ConfigStore } from './config-store';
import { IPC } from '../shared/ipc-channels';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let configStore: ConfigStore | null = null;
const sessionStore = new Store({ name: 'tmax-session' });

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    show: false,
    title: 'tmax',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show, displaying...');
    // Reset any Chromium zoom to 100% - we handle zoom ourselves via terminal fontSize
    mainWindow!.webContents.setZoomLevel(0);
    mainWindow!.maximize();
    mainWindow!.show();
    mainWindow!.focus();
  });

  // Prevent Chromium's built-in zoom (Ctrl+=/-, Ctrl+0, Ctrl+mousewheel)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && !input.shift && !input.alt) {
      if (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0') {
        mainWindow!.webContents.setZoomLevel(0);
      }
    }
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = ['LOG', 'WARN', 'ERROR'][level] || 'INFO';
    console.log(`[RENDERER ${prefix}] ${message} (${sourceId}:${line})`);
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
      mainWindow?.webContents.send(IPC.PTY_DATA, id, data);
    },
    onExit(id: string, exitCode: number | undefined) {
      mainWindow?.webContents.send(IPC.PTY_EXIT, id, exitCode);
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
      return ptyManager!.create(opts);
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

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configStore!.getAll();
  });

  ipcMain.handle(
    IPC.CONFIG_SET,
    (_event, key: string, value: unknown) => {
      configStore!.set(key as keyof ReturnType<ConfigStore['getAll']>, value as never);
    }
  );

  ipcMain.handle(IPC.SESSION_SAVE, (_event, data: unknown) => {
    sessionStore.set('session', data);
  });

  ipcMain.handle(IPC.CONFIG_OPEN, () => {
    const configPath = configStore!.getPath();
    shell.openPath(configPath);
  });

  ipcMain.handle(IPC.SESSION_LOAD, () => {
    return sessionStore.get('session', null);
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

app.whenReady().then(() => {
  try {
    setupConfigStore();
    console.log('Config store ready');
    setupPtyManager();
    console.log('PTY manager ready');
    createWindow();
    console.log('Window created');
    registerIpcHandlers();
    console.log('IPC handlers registered');
  } catch (error) {
    console.error('Startup error:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  ptyManager?.killAll();
  app.quit();
});
