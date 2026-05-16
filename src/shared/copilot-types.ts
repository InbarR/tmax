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

// ClawPilot rides on the Copilot SDK, so its sessions share the same
// on-disk store as the Copilot CLI and look identical to the parser. The
// SDK doesn't populate sessions.host_type today (always null), but
// ClawPilot injects a literal "[Clawpilot context: Current date and time
// is ...]" marker into every user prompt. Matching on that substring
// identifies ClawPilot sessions reliably until/unless their prompt
// template changes. Shared between main (notification labels) and renderer
// (panel badge) so the magic string lives in one place.
const CLAWPILOT_MARKER = '[clawpilot context:';
// Continuation turns send a "Here is the conversation:\nuser: ...\nassistant: ..."
// wrapper instead of the marker, and the marker can also be sliced out of
// short summary/latestPrompt copies. The cwd path is the next-best
// fingerprint because ClawPilot always launches in its own folder.
const CLAWPILOT_CWD_SEGMENT = /(^|[/\\])clawpilot([/\\]|$)/i;

export function detectSessionHost(session: Pick<CopilotSessionSummary, 'provider' | 'latestPrompt' | 'summary' | 'cwd'>): 'clawpilot' | null {
  // ClawPilot can wrap either Copilot or Claude Code (e.g. when invoked
  // through Teams it uses the Claude Code SDK). The marker is provider-
  // agnostic, so we only check for the magic string, not the provider.
  const haystack = `${session.latestPrompt ?? ''}\n${session.summary ?? ''}`.toLowerCase();
  if (haystack.includes(CLAWPILOT_MARKER)) return 'clawpilot';
  if (session.cwd && CLAWPILOT_CWD_SEGMENT.test(session.cwd)) return 'clawpilot';
  return null;
}

// Strip the ClawPilot-injected "[Clawpilot context: Current date and time
// is ...]" suffix from a prompt/summary string. Once a notification or
// panel row already shows the session is from ClawPilot, the preamble is
// noise. Case-insensitive; tolerates missing trailing bracket.
export function stripClawpilotContext(s: string): string {
  return s.replace(/\s*\[clawpilot context:[\s\S]*$/i, '').trim();
}

export interface CopilotWorkspaceMetadata {
  cwd: string;
  branch: string;
  repository: string;
  name: string;
  summary: string;
  /**
   * True when the user explicitly renamed this session via the Copilot CLI
   * `/rename` command. Persists in workspace.yaml as `user_named: true`.
   * When true, the parser preserves the on-disk `name` value verbatim and
   * skips any auto-derivation from summary/repo/cwd. Issue #2 follow-up.
   */
  userNamed?: boolean;
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
  /**
   * Optional event-by-event timeline for the session. The aggregate parser
   * does NOT populate this field on the hot path (would re-introduce the
   * unbounded-cache OOM that the perf refactor fixed); callers who need a
   * full timeline should fetch it lazily on demand. Field is kept on the
   * shared type so consumers can opt in without a breaking change.
   */
  timeline?: CopilotActivityEntry[];
}
