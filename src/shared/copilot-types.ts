export type CopilotSessionStatus =
  | 'idle'
  | 'thinking'
  | 'executingTool'
  | 'awaitingApproval'
  | 'waitingForUser';

export type SessionProvider = 'copilot' | 'claude-code';
export type SessionLifecycle = 'active' | 'completed' | 'old';

export interface CopilotSessionSummary {
  id: string;
  provider: SessionProvider;
  status: CopilotSessionStatus;
  cwd: string;
  branch: string;
  repository: string;
  summary: string;
  /** Auto-generated session nickname (Claude Code only - e.g. "calm-river") */
  slug?: string;
  /** Most recent user prompt - useful when the terminal has scrolled past it */
  latestPrompt?: string;
  /** Timestamp (ms since epoch) of the most recent user prompt */
  latestPromptTime?: number;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  model?: string;
  wsl?: boolean;
  wslDistro?: string;
}

export interface CopilotWorkspaceMetadata {
  cwd: string;
  branch: string;
  repository: string;
  name: string;
  summary: string;
}

export interface CopilotActivityEntry {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface CopilotSession {
  id: string;
  status: CopilotSessionStatus;
  workspace: CopilotWorkspaceMetadata;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  pendingToolCalls: number;
  totalTokens: number;
  latestPrompt?: string;
  latestPromptTime?: number;
}
