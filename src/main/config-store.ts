import Store from 'electron-store';

export interface ShellProfile {
  id: string;
  name: string;
  path: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface ThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface Keybinding {
  action: string;
  key: string;
}

export interface TerminalDefaults {
  fontSize: number;
  fontFamily: string;
  scrollback: number;
}

export interface AppConfig {
  shells: ShellProfile[];
  defaultShellId: string;
  keybindings: Keybinding[];
  theme: ThemeColors;
  terminal: TerminalDefaults;
}

function getDefaultShells(): { shells: ShellProfile[]; defaultShellId: string } {
  if (process.platform === 'win32') {
    return {
      shells: [
        { id: 'powershell', name: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: [] },
        { id: 'cmd', name: 'CMD', path: 'cmd.exe', args: [] },
        { id: 'wsl', name: 'WSL', path: 'wsl.exe', args: [] },
      ],
      defaultShellId: 'powershell',
    };
  }
  if (process.platform === 'darwin') {
    return {
      shells: [
        { id: 'zsh', name: 'zsh', path: '/bin/zsh', args: ['-l'] },
        { id: 'bash', name: 'bash', path: '/bin/bash', args: ['-l'] },
      ],
      defaultShellId: 'zsh',
    };
  }
  // Linux
  return {
    shells: [
      { id: 'bash', name: 'bash', path: '/bin/bash', args: [] },
      { id: 'zsh', name: 'zsh', path: '/usr/bin/zsh', args: [] },
      { id: 'fish', name: 'fish', path: '/usr/bin/fish', args: [] },
    ],
    defaultShellId: 'bash',
  };
}

const platformShells = getDefaultShells();

const defaultConfig: AppConfig = {
  shells: platformShells.shells,
  defaultShellId: platformShells.defaultShellId,
  keybindings: [
    { action: 'createTerminal', key: 'Ctrl+Shift+N' },
    { action: 'closeTerminal', key: 'Ctrl+Shift+W' },
    { action: 'focusUp', key: 'Shift+ArrowUp' },
    { action: 'focusDown', key: 'Shift+ArrowDown' },
    { action: 'focusLeft', key: 'Shift+ArrowLeft' },
    { action: 'focusRight', key: 'Shift+ArrowRight' },
    { action: 'splitHorizontal', key: 'Ctrl+Shift+ArrowRight' },
    { action: 'splitVertical', key: 'Ctrl+Shift+ArrowDown' },
    { action: 'toggleFloat', key: 'Ctrl+Shift+F' },
    { action: 'resizeUp', key: 'Ctrl+Shift+Alt+ArrowUp' },
    { action: 'resizeDown', key: 'Ctrl+Shift+Alt+ArrowDown' },
    { action: 'resizeLeft', key: 'Ctrl+Shift+Alt+ArrowLeft' },
    { action: 'resizeRight', key: 'Ctrl+Shift+Alt+ArrowRight' },
    { action: 'swapNext', key: 'Ctrl+Shift+.' },
    { action: 'swapPrev', key: 'Ctrl+Shift+,' },
  ],
  theme: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },
  terminal: {
    fontSize: 14,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    scrollback: 5000,
  },
};

export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'termmight-config',
      defaults: defaultConfig,
    });
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }

  getAll(): AppConfig {
    return this.store.store;
  }

  getPath(): string {
    return this.store.path;
  }

  reset(): void {
    this.store.clear();
  }
}
