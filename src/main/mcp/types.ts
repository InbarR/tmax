/**
 * Cross-pane MCP server — main-process types.
 *
 * v1 is read-only. tmax exposes each pane as a structured resource and lets
 * a CLI agent in another pane read its buffer or (when the pane runs Copilot
 * CLI / Claude Code) its session-state.
 *
 * See `PLAN_CROSS_PANE_MCP_V1.md` for the design rationale.
 */

export type GrantLevel = 'buffer' | 'session';

export type AgentProvider = 'copilot' | 'claude-code';

export interface PaneInfo {
  id: string;
  title: string;
  cwd: string;
  pid: number;
  /** True when this pane is hosting a recognized CLI agent. */
  isAgent: boolean;
  /** Provider of the recognized agent, if any. */
  provider?: AgentProvider;
  /** AI session id bound to this pane, if any. */
  aiSessionId?: string;
  /** Last known shell/process name (e.g. 'npm test'). */
  lastProcess?: string;
  /** Approximate timestamp of last PTY output (ms since epoch). */
  lastActivityTime?: number;
  /** Last process exit code, if the PTY has exited. */
  lastExitCode?: number | null;
  wsl?: boolean;
  wslDistro?: string;
}

export interface Grant {
  /** Pane id of the agent that's allowed to read. */
  granteePane: string;
  /** Pane id being read. */
  targetPane: string;
  /** What can be read. 'session' implies 'buffer' on the same target. */
  level: GrantLevel;
  /** Grant timestamp (ms since epoch). */
  grantedAt: number;
}

export interface AuditEntry {
  ts: number;
  granteePane: string;
  targetPane: string;
  tool: string;
  argsSummary: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface ToolCallContext {
  /** Pane id whose agent is making the call. */
  granteePane: string;
  permissions: PermissionsAPI;
  paneRegistry: PaneRegistryAPI;
  audit: (entry: Omit<AuditEntry, 'ts'>) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Tier this tool requires on the target pane. 'buffer' tools work on any
   * pane the agent has been granted access to; 'session' tools also need a
   * session-level grant on a pane that hosts a recognized CLI agent.
   */
  tier: GrantLevel;
  handler: (args: Record<string, unknown>, ctx: ToolCallContext) => Promise<ToolResult>;
}

export interface ToolResult {
  /** Plain text content blocks per MCP spec. */
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface PermissionsAPI {
  list(): Grant[];
  grant(granteePane: string, targetPane: string, level: GrantLevel): Grant;
  revoke(granteePane: string, targetPane: string): void;
  revokeAllForPane(paneId: string): void;
  /** Returns the highest level granted, or null if no grant exists. */
  resolve(granteePane: string, targetPane: string): GrantLevel | null;
  clear(): void;
  /** Subscribe to grant changes. Returns an unsubscribe function. */
  onChange(cb: () => void): () => void;
}

export interface PaneRegistryAPI {
  list(): PaneInfo[];
  get(paneId: string): PaneInfo | undefined;
  /** Renderer-driven snapshot push. */
  update(snapshot: import('./pane-registry').PaneSnapshot): void;
  /** Out-of-band agent binding (e.g. cwd-matched session detection). */
  setAgentBinding(paneId: string, provider: AgentProvider, aiSessionId: string): void;
  onChange(cb: () => void): () => void;
}

/**
 * Caps that bound resource use for any single tool call.
 *
 * - `MAX_TAIL_LINES`: requested `n` is clamped to this.
 * - `MAX_TOOL_RESULT_BYTES`: total text payload is truncated past this.
 * - `MAX_FILE_BYTES`: per-file read cap inside a Copilot session dir.
 * - `BUFFER_RING_BYTES`: per-pane ring buffer size in main process.
 */
export const MCP_LIMITS = {
  MAX_TAIL_LINES: 2000,
  MAX_TOOL_RESULT_BYTES: 64 * 1024,
  MAX_FILE_BYTES: 256 * 1024,
  BUFFER_RING_BYTES: 256 * 1024,
} as const;
