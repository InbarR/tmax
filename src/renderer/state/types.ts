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

// Snapshot taken when a tile is floated, used to put it back in the same spot
// when un-floated. Without this, the tile-to-tile round trip flattens
// non-trivial grids into a single row (toggleFloat re-inserted via the
// tab-neighbour heuristic, which always splits horizontally).
export interface PreFloatAnchor {
  parentPath: ('first' | 'second')[]; // path to the floated leaf's parent in the tree at float time
  parentDirection: SplitDirection;
  parentRatio: number;
  position: 'first' | 'second'; // where the floated leaf sat in its parent
}

export interface FloatingPanelState {
  terminalId: TerminalId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  maximized?: boolean;
  preFloatAnchor?: PreFloatAnchor;
}

// ── Layout root ──────────────────────────────────────────────────────

export interface LayoutState {
  tilingRoot: LayoutNode | null;
  floatingPanels: FloatingPanelState[];
}

// ── Workspaces (TASK-40) ─────────────────────────────────────────────
// A workspace is a named collection of panes with its own grid.
// Today's "flat" tab mode: one default workspace holds all terminals
// (UI hides the workspace bar entirely).
// "Workspaces" tab mode: each tab in the bar represents a workspace;
// clicking a chip swaps the active workspace and remounts its grid.

export type WorkspaceId = string;

export interface Workspace {
  id: WorkspaceId;
  name: string;
  /** Color hint for the workspace chip. Optional. */
  color?: string;
  layout: LayoutState;
}

export const DEFAULT_WORKSPACE_ID = 'workspace-default';
export const DEFAULT_WORKSPACE_NAME = 'Workspace';

// ── Terminal instances ───────────────────────────────────────────────

export interface TerminalInstance {
  id: TerminalId;
  title: string;
  customTitle: boolean;
  shellProfileId: string;
  cwd: string;
  mode: 'tiled' | 'floating' | 'dormant' | 'detached';
  tabColor?: string;
  pid: number;
  lastProcess: string;
  startupCommand: string;
  startupCommandSent?: boolean;
  aiSessionId?: string;
  aiAutoTitle?: boolean;
  /**
   * True when the pane title was auto-derived from the user's first
   * shell command (TASK-23) rather than explicitly set by the user.
   * customTitle is also true in that case (so OSC titles don't override),
   * but this flag lets the AI-link path tell the two apart: a real user
   * rename is preserved when an AI session is detected, but a
   * first-command auto-title is NOT - the AI session topic should take
   * over. See TASK-88 / GH #85.
   */
  firstCommandTitle?: boolean;
  groupId?: string;
  /** Which workspace this terminal belongs to. (TASK-40) */
  workspaceId?: WorkspaceId;
  wsl?: boolean;
  wslDistro?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
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
  // TASK-52: when true (default), copy operations stitch CLI-rendered
  // hard newlines + 1-2 space continuation indents back into single
  // paragraphs. Disable if it ever clobbers code/structure.
  smartUnwrapCopy?: boolean;
}

export type BackgroundMaterial = 'none' | 'auto' | 'mica' | 'acrylic' | 'tabbed';

export interface AppConfig {
  shells: ShellProfile[];
  defaultShellId: string;
  keybindings: Keybinding[];
  theme: ThemeConfig;
  terminal: TerminalConfig;
  copilotCommand?: string;
  claudeCodeCommand?: string;
  tabBarPosition?: 'top' | 'bottom' | 'left' | 'right';
  // Tab semantics. "flat" (default): one tab per terminal (today's
  // behavior). "workspaces": each tab is a named collection of panes
  // with its own grid. (TASK-40)
  tabMode?: 'flat' | 'workspaces';
  hideTabCloseButtons?: boolean;
  backgroundMaterial?: BackgroundMaterial;
  backgroundOpacity?: number; // 0.0–1.0, default 0.8
}

// ── Drag & drop ──────────────────────────────────────────────────────

export type DropSide = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'float';
