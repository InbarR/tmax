// ── Terminal identifiers ──────────────────────────────────────────────

export type TerminalId = string;

// ── Layout tree ──────────────────────────────────────────────────────

export type SplitDirection = 'horizontal' | 'vertical';

export interface LayoutSplitNode {
  kind: 'split';
  id: string;
  direction: SplitDirection;
  splitRatio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export interface LayoutLeafNode {
  kind: 'leaf';
  terminalId: TerminalId;
}

export type LayoutNode = LayoutSplitNode | LayoutLeafNode;

// ── Floating panels ──────────────────────────────────────────────────

export interface FloatingPanelState {
  terminalId: TerminalId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

// ── Layout root ──────────────────────────────────────────────────────

export interface LayoutState {
  tilingRoot: LayoutNode | null;
  floatingPanels: FloatingPanelState[];
}

// ── Terminal instances ───────────────────────────────────────────────

export interface TerminalInstance {
  id: TerminalId;
  title: string;
  customTitle: boolean;
  shellProfileId: string;
  cwd: string;
  mode: 'tiled' | 'floating';
  pid: number;
  lastProcess: string;
  startupCommand: string;
}

// ── Configuration ────────────────────────────────────────────────────

export interface ShellProfile {
  id: string;
  name: string;
  path: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface Keybinding {
  action: string;
  key: string;
}

export interface ThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  [key: string]: string;
}

export interface TerminalConfig {
  fontSize: number;
  fontFamily: string;
  scrollback: number;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
}

export interface AppConfig {
  shells: ShellProfile[];
  defaultShellId: string;
  keybindings: Keybinding[];
  theme: ThemeConfig;
  terminal: TerminalConfig;
}

// ── Drag & drop ──────────────────────────────────────────────────────

export type DropSide = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'float';
