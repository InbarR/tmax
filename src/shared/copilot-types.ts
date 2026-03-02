export type CopilotSessionStatus =
  | 'idle'
  | 'thinking'
  | 'executingTool'
  | 'awaitingApproval'
  | 'waitingForUser';

export type SessionProvider = 'copilot' | 'claude-code';

export interface CopilotSessionSummary {
  id: string;
  provider: SessionProvider;
  status: CopilotSessionStatus;
  cwd: string;
  branch: string;
  repository: string;
  summary: string;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  model?: string;
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
  timeline: CopilotActivityEntry[];
  pendingToolCalls: number;
  totalTokens: number;
}
