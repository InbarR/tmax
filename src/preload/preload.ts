import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

export interface TerminalAPI {
  createPty(opts: {
    id: string;
    shellPath: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    cols: number;
    rows: number;
  }): Promise<{ id: string; pid: number }>;
  writePty(id: string, data: string): void;
  resizePty(id: string, cols: number, rows: number): Promise<void>;
  killPty(id: string): Promise<void>;
  onPtyData(cb: (id: string, data: string) => void): () => void;
  onPtyExit(cb: (id: string, exitCode: number | undefined) => void): () => void;
  getConfig(): Promise<Record<string, unknown>>;
  setConfig(key: string, value: unknown): Promise<void>;
}

const terminalAPI: TerminalAPI = {
  createPty(opts) {
    return ipcRenderer.invoke(IPC.PTY_CREATE, opts);
  },

  writePty(id, data) {
    ipcRenderer.send(IPC.PTY_WRITE, id, data);
  },

  resizePty(id, cols, rows) {
    return ipcRenderer.invoke(IPC.PTY_RESIZE, id, cols, rows);
  },

  killPty(id) {
    return ipcRenderer.invoke(IPC.PTY_KILL, id);
  },

  onPtyData(cb) {
    const listener = (_event: Electron.IpcRendererEvent, id: string, data: string) => {
      cb(id, data);
    };
    ipcRenderer.on(IPC.PTY_DATA, listener);
    return () => {
      ipcRenderer.removeListener(IPC.PTY_DATA, listener);
    };
  },

  onPtyExit(cb) {
    const listener = (_event: Electron.IpcRendererEvent, id: string, exitCode: number | undefined) => {
      cb(id, exitCode);
    };
    ipcRenderer.on(IPC.PTY_EXIT, listener);
    return () => {
      ipcRenderer.removeListener(IPC.PTY_EXIT, listener);
    };
  },

  getConfig() {
    return ipcRenderer.invoke(IPC.CONFIG_GET);
  },

  setConfig(key, value) {
    return ipcRenderer.invoke(IPC.CONFIG_SET, key, value);
  },

  openConfigFile() {
    return ipcRenderer.invoke(IPC.CONFIG_OPEN);
  },

  openPath(filePath: string) {
    return ipcRenderer.invoke(IPC.OPEN_PATH, filePath);
  },

  saveSession(data: unknown) {
    return ipcRenderer.invoke(IPC.SESSION_SAVE, data);
  },

  loadSession(): Promise<unknown> {
    return ipcRenderer.invoke(IPC.SESSION_LOAD);
  },
};

contextBridge.exposeInMainWorld('terminalAPI', terminalAPI);
