/**
 * Types shared between the main and renderer processes for the cross-pane
 * MCP feature. Renderer surfaces the grants matrix and per-pane indicators
 * using these.
 */

export type McpGrantLevel = 'buffer' | 'session';

export interface McpGrant {
  granteePane: string;
  targetPane: string;
  level: McpGrantLevel;
  grantedAt: number;
}

export interface McpServerStatus {
  enabled: boolean;
  /** URL of the local MCP listener, or null if not running. */
  url: string | null;
  /** Token, surfaced read-only for diagnostics; agents get it via PTY env. */
  token: string | null;
  auditLogPath: string | null;
}
