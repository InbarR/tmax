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

export type BackgroundMaterial = 'none' | 'auto' | 'mica' | 'acrylic' | 'tabbed';

export interface AppConfig {
  shells: ShellProfile[];
  defaultShellId: string;
  keybindings: Keybinding[];
  theme: ThemeColors;
  terminal: TerminalDefaults;
  copilotCommand?: string;
  claudeCodeCommand?: string;
  tabBarPosition?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Tab semantics: "flat" (default) keeps today's behavior - one tab per
   * terminal. "workspaces" makes each tab a named collection of panes
   * with its own grid; clicking a chip swaps the entire layout. (TASK-40)
   */
  tabMode?: 'flat' | 'workspaces';
  backgroundMaterial?: BackgroundMaterial;
  backgroundOpacity?: number; // 0.0–1.0, default 0.8
}

function findPwsh(): string | null {
  if (process.platform !== 'win32') return null;
  const fs = require('fs');

  // 1) PATH lookup: covers winget, Program Files, scoop shim, chocolatey, custom installs
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('where.exe', ['pwsh.exe'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }) as string;
    const firstLine = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    // Skip MSIX WindowsApps stub - it's an execution alias that node-pty can't spawn reliably
    if (firstLine && fs.existsSync(firstLine) && !/\\WindowsApps\\/i.test(firstLine)) {
      return firstLine;
    }
  } catch {
    // where.exe not found or no match on PATH
  }

  // 2) Well-known install locations as fallback
  const candidates = [
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`,
    process.env.ProgramW6432 && `${process.env.ProgramW6432}\\PowerShell\\7\\pwsh.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\PowerShell\\7\\pwsh.exe`,
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\PowerShell\\7-preview\\pwsh.exe`,
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

export const defaultConfig: AppConfig = {
  shells: platformShells.shells,
  defaultShellId: platformShells.defaultShellId,
  keybindings: [
    { action: 'createTerminal', key: 'Ctrl+T' },
    // Ctrl+W intentionally omitted - it's the readline / bash / zsh /
    // Claude Code shortcut for "delete previous word". Pane-close is
    // Ctrl+Shift+W only. (TASK-38)
    { action: 'createTerminal', key: 'Ctrl+Shift+N' },
    { action: 'closeTerminal', key: 'Ctrl+Shift+W' },
    // Workspaces (TASK-40). Only meaningful in workspaces tab mode.
    // Ctrl+Tab / Ctrl+Shift+Tab are reserved for focusNext/focusPrev.
    { action: 'nextWorkspace', key: 'Ctrl+Shift+]' },
    { action: 'prevWorkspace', key: 'Ctrl+Shift+[' },
    { action: 'goToWorkspace1', key: 'Ctrl+1' },
    { action: 'goToWorkspace2', key: 'Ctrl+2' },
    { action: 'goToWorkspace3', key: 'Ctrl+3' },
    { action: 'goToWorkspace4', key: 'Ctrl+4' },
    { action: 'goToWorkspace5', key: 'Ctrl+5' },
    { action: 'goToWorkspace6', key: 'Ctrl+6' },
    { action: 'goToWorkspace7', key: 'Ctrl+7' },
    { action: 'goToWorkspace8', key: 'Ctrl+8' },
    { action: 'goToWorkspace9', key: 'Ctrl+9' },
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
    { action: 'toggleFloat', key: 'Ctrl+Shift+U' },
    { action: 'resizeUp', key: 'Ctrl+Shift+Alt+ArrowUp' },
    { action: 'resizeDown', key: 'Ctrl+Shift+Alt+ArrowDown' },
    { action: 'resizeLeft', key: 'Ctrl+Shift+Alt+ArrowLeft' },
    { action: 'resizeRight', key: 'Ctrl+Shift+Alt+ArrowRight' },
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
  copilotCommand: 'copilot',
  claudeCodeCommand: 'claude',
  backgroundMaterial: 'none',
  backgroundOpacity: 0.8,
};

export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'tmax-config',
      defaults: defaultConfig,
    });
    this.migratePwsh();
    this.migrateKeybindings();
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

  /**
   * Migrations:
   *  - Inject Ctrl+T binding for existing users who pre-date it.
   *  - Remove Ctrl+W -> closeTerminal (TASK-38). It conflicts with
   *    readline / bash / zsh / Claude Code's "delete previous word" -
   *    users have lost panes typing Ctrl+W expecting a word delete.
   *    Pane-close stays on Ctrl+Shift+W only. We strip it
   *    unconditionally; users who explicitly want Ctrl+W to close
   *    can re-add it via the bindings file.
   */
  private migrateKeybindings(): void {
    let bindings = this.store.get('keybindings') as Keybinding[];
    let changed = false;

    // Strip the legacy Ctrl+W -> closeTerminal entry.
    const filtered = bindings.filter(
      (b) => !(b.key === 'Ctrl+W' && b.action === 'closeTerminal'),
    );
    if (filtered.length !== bindings.length) {
      bindings = filtered;
      changed = true;
    }

    // Ensure Ctrl+T is bound for older users.
    const boundKeys = new Set(bindings.map((b) => b.key));
    if (!boundKeys.has('Ctrl+T')) {
      bindings = [{ action: 'createTerminal', key: 'Ctrl+T' }, ...bindings];
      changed = true;
    }

    if (changed) this.store.set('keybindings', bindings);
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
