export const IPC = {
  PTY_CREATE: 'pty:create',
  PTY_DATA: 'pty:data',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_EXIT: 'pty:exit',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  CONFIG_OPEN: 'config:open',
  OPEN_PATH: 'shell:openPath',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
