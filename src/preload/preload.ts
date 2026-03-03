import { contextBridge, ipcRenderer, clipboard } from 'electron';
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
  clipboardRead(): string;
  clipboardWrite(text: string): void;
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

  clipboardRead() {
    return clipboard.readText();
  },

  clipboardWrite(text: string) {
    clipboard.writeText(text);
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

  detachTerminal(id: string) {
    return ipcRenderer.invoke(IPC.DETACH_CREATE, id);
  },

  closeDetached(id: string) {
    return ipcRenderer.invoke(IPC.DETACH_CLOSE, id);
  },

  focusDetached(id: string) {
    return ipcRenderer.invoke(IPC.DETACH_FOCUS, id);
  },

  onDetachedClosed(cb: (id: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => {
      cb(id);
    };
    ipcRenderer.on(IPC.DETACH_CLOSED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.DETACH_CLOSED, listener);
    };
  },

  // ── Copilot session APIs ──────────────────────────────────────────
  listCopilotSessions() {
    return ipcRenderer.invoke(IPC.COPILOT_LIST_SESSIONS);
  },

  getCopilotSession(id: string) {
    return ipcRenderer.invoke(IPC.COPILOT_GET_SESSION, id);
  },

  searchCopilotSessions(query: string) {
    return ipcRenderer.invoke(IPC.COPILOT_SEARCH_SESSIONS, query);
  },

  startCopilotWatching() {
    return ipcRenderer.invoke(IPC.COPILOT_START_WATCHING);
  },

  stopCopilotWatching() {
    return ipcRenderer.invoke(IPC.COPILOT_STOP_WATCHING);
  },

  getCopilotPrompts(id: string) {
    return ipcRenderer.invoke(IPC.COPILOT_GET_PROMPTS, id);
  },

  onCopilotSessionUpdated(cb: (session: unknown) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, session: unknown) => {
      cb(session);
    };
    ipcRenderer.on(IPC.COPILOT_SESSION_UPDATED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.COPILOT_SESSION_UPDATED, listener);
    };
  },

  onCopilotSessionAdded(cb: (session: unknown) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, session: unknown) => {
      cb(session);
    };
    ipcRenderer.on(IPC.COPILOT_SESSION_ADDED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.COPILOT_SESSION_ADDED, listener);
    };
  },

  onCopilotSessionRemoved(cb: (sessionId: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string) => {
      cb(sessionId);
    };
    ipcRenderer.on(IPC.COPILOT_SESSION_REMOVED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.COPILOT_SESSION_REMOVED, listener);
    };
  },

  // ── Claude Code session APIs ───────────────────────────────────────
  listClaudeCodeSessions() {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_LIST_SESSIONS);
  },

  getClaudeCodeSession(id: string) {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_GET_SESSION, id);
  },

  searchClaudeCodeSessions(query: string) {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_SEARCH_SESSIONS, query);
  },

  startClaudeCodeWatching() {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_START_WATCHING);
  },

  stopClaudeCodeWatching() {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_STOP_WATCHING);
  },

  getClaudeCodePrompts(id: string) {
    return ipcRenderer.invoke(IPC.CLAUDE_CODE_GET_PROMPTS, id);
  },

  onClaudeCodeSessionUpdated(cb: (session: unknown) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, session: unknown) => {
      cb(session);
    };
    ipcRenderer.on(IPC.CLAUDE_CODE_SESSION_UPDATED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.CLAUDE_CODE_SESSION_UPDATED, listener);
    };
  },

  onClaudeCodeSessionAdded(cb: (session: unknown) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, session: unknown) => {
      cb(session);
    };
    ipcRenderer.on(IPC.CLAUDE_CODE_SESSION_ADDED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.CLAUDE_CODE_SESSION_ADDED, listener);
    };
  },

  onClaudeCodeSessionRemoved(cb: (sessionId: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string) => {
      cb(sessionId);
    };
    ipcRenderer.on(IPC.CLAUDE_CODE_SESSION_REMOVED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.CLAUDE_CODE_SESSION_REMOVED, listener);
    };
  },

};

contextBridge.exposeInMainWorld('terminalAPI', terminalAPI);
