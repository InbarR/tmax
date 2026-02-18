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

function findPwsh(): string | null {
  if (process.platform !== 'win32') return null;
  const fs = require('fs');
  // Common install locations for PowerShell 7+
  const candidates = [
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`,
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function getDefaultShells(): { shells: ShellProfile[]; defaultShellId: string } {
  if (process.platform === 'win32') {
    const pwshPath = findPwsh();
    const shells: ShellProfile[] = [];
    if (pwshPath) {
      shells.push({ id: 'pwsh', name: 'PowerShell 7', path: pwshPath, args: ['-NoLogo'] });
    }
    shells.push(
      { id: 'powershell', name: 'Windows PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: [] },
      { id: 'cmd', name: 'CMD', path: 'cmd.exe', args: [] },
      { id: 'wsl', name: 'WSL', path: 'wsl.exe', args: [] },
    );
    return {
      shells,
      defaultShellId: pwshPath ? 'pwsh' : 'powershell',
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
    { action: 'moveRight', key: 'Ctrl+Shift+ArrowRight' },
    { action: 'moveDown', key: 'Ctrl+Shift+ArrowDown' },
    { action: 'moveLeft', key: 'Ctrl+Shift+ArrowLeft' },
    { action: 'moveUp', key: 'Ctrl+Shift+ArrowUp' },
    { action: 'splitHorizontal', key: 'Ctrl+Alt+ArrowRight' },
    { action: 'splitHorizontalLeft', key: 'Ctrl+Alt+ArrowLeft' },
    { action: 'splitVertical', key: 'Ctrl+Alt+ArrowDown' },
    { action: 'splitVerticalUp', key: 'Ctrl+Alt+ArrowUp' },
    { action: 'toggleFocusMode', key: 'Ctrl+Shift+F' },
    { action: 'resizeUp', key: 'Ctrl+Shift+Alt+ArrowUp' },
    { action: 'resizeDown', key: 'Ctrl+Shift+Alt+ArrowDown' },
    { action: 'resizeLeft', key: 'Ctrl+Shift+Alt+ArrowLeft' },
    { action: 'resizeRight', key: 'Ctrl+Shift+Alt+ArrowRight' },
    { action: 'resizeRight', key: 'Ctrl+ArrowRight' },
    { action: 'resizeLeft', key: 'Ctrl+ArrowLeft' },
    { action: 'resizeDown', key: 'Ctrl+ArrowDown' },
    { action: 'resizeUp', key: 'Ctrl+ArrowUp' },
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
    fontFamily: 'CaskaydiaCove Nerd Font, CaskaydiaCove NF, Cascadia Code, Consolas, monospace',
    scrollback: 5000,
  },
};

export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'tmax-config',
      defaults: defaultConfig,
    });
    this.migratePwsh();
  }

  /** If PowerShell 7 is installed but not in the saved shells, inject it at the top */
  private migratePwsh(): void {
    if (process.platform !== 'win32') return;
    const pwshPath = findPwsh();
    if (!pwshPath) return;
    const shells = this.store.get('shells') as ShellProfile[];
    if (shells.some((s) => s.id === 'pwsh')) return;
    shells.unshift({ id: 'pwsh', name: 'PowerShell 7', path: pwshPath, args: ['-NoLogo'] });
    this.store.set('shells', shells);
    this.store.set('defaultShellId', 'pwsh');
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
