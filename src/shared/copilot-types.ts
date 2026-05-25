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
  /** Very first user.message in the session, captured once and sticky.
   *  Provides the session's opening ask for hover tooltips on the pane /
   *  tab title when row.summary churns on every turn. */
  firstPrompt?: string;
  /** Most recent user prompt - useful when the terminal has scrolled past it */
  latestPrompt?: string;
  /** Timestamp (ms since epoch) of the most recent user prompt */
  latestPromptTime?: number;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  /** Session creation time (ms since epoch) - sourced from workspace.yaml
   *  `created_at` or the SQLite `created_at` column. Used by the cwd
   *  auto-link path to tell a freshly-spawned session apart from a
   *  long-running session that's just been re-activated in the same
   *  folder. Optional for backwards compatibility with restored sessions
   *  that pre-date this field. */
  createdAt?: number;
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
// TASK-161: continuation-turn fingerprint. Continuation turns drop the
// "[clawpilot context: ...]" marker entirely and prefix the prompt with
// a "Here is the conversation:\nuser: ..." wrapper. We use this wrapper
// as a marker-substitute - but only AS A SECONDARY signal alongside the
// cwd check. cwd alone is not sufficient: plain Claude Code sessions
// developed inside a /clawpilot/ folder (e.g. the user working on the
// ClawPilot project itself) were getting falsely labelled as ClawPilot
// toasts.
const CLAWPILOT_CONTINUATION_MARKER = 'here is the conversation:\nuser:';
const CLAWPILOT_CWD_SEGMENT = /(^|[/\\])clawpilot([/\\]|$)/i;

export function detectSessionHost(session: Pick<CopilotSessionSummary, 'provider' | 'latestPrompt' | 'summary' | 'cwd'>): 'clawpilot' | null {
  // ClawPilot can wrap either Copilot or Claude Code (e.g. when invoked
  // through Teams it uses the Claude Code SDK). The marker is provider-
  // agnostic, so we only check for the magic string, not the provider.
  const haystack = `${session.latestPrompt ?? ''}\n${session.summary ?? ''}`.toLowerCase();
  if (haystack.includes(CLAWPILOT_MARKER)) return 'clawpilot';
  // Continuation-turn fallback (TASK-161 / follow-up):
  //  - The wrapper text "Here is the conversation:\nuser:" identifies a
  //    ClawPilot continuation. We accept it when it appears AT THE START
  //    of latestPrompt or summary - that's where ClawPilot puts it. A user
  //    pasting the same phrase mid-prompt won't match. This catches
  //    ClawPilot sessions running outside a /clawpilot/ cwd folder.
  //  - As a separate, weaker fallback, we still accept wrapper-anywhere
  //    combined with a /clawpilot/ cwd. Either signal alone (cwd-alone,
  //    or mid-text wrapper) is not enough.
  const latestStart = (session.latestPrompt ?? '').trim().toLowerCase().slice(0, 64);
  const summaryStart = (session.summary ?? '').trim().toLowerCase().slice(0, 64);
  if (
    latestStart.startsWith(CLAWPILOT_CONTINUATION_MARKER) ||
    summaryStart.startsWith(CLAWPILOT_CONTINUATION_MARKER)
  ) return 'clawpilot';
  if (
    session.cwd && CLAWPILOT_CWD_SEGMENT.test(session.cwd) &&
    haystack.includes(CLAWPILOT_CONTINUATION_MARKER)
  ) return 'clawpilot';
  return null;
}

// Strip the ClawPilot-injected "[Clawpilot context: Current date and time
// is ...]" suffix AND the "Here is the conversation:\nuser: ...\nassistant: ..."
// continuation-turn wrapper from a prompt/summary string. Once a notification
// or panel row already shows the session is from ClawPilot, the preamble /
// transcript dump is just noise that buries the actual latest user prompt.
// Case-insensitive; tolerates missing trailing bracket. (TASK-152)
export function stripClawpilotContext(s: string): string {
  let out = s.replace(/\s*\[clawpilot context:[\s\S]*$/i, '');
  // Continuation-turn wrapper: ClawPilot replays the entire conversation
  // before the new prompt as "Here is the conversation:\nuser: <prev>\n
  // assistant: <prev>\nuser: <NEW>". The actual fresh prompt is the LAST
  // "user:" segment, so keep only that. If no "user:" lines are present
  // after the header (rare malformed payload), drop the header alone.
  const headerMatch = out.match(/here is the conversation:\s*/i);
  if (headerMatch) {
    const afterHeader = out.slice((headerMatch.index ?? 0) + headerMatch[0].length);
    const lastUserIdx = afterHeader.search(/(?:^|\n)\s*user:\s*/i);
    if (lastUserIdx === -1) {
      out = out.slice(0, headerMatch.index ?? 0);
    } else {
      // Find the LAST user: segment (not just the first).
      const userRe = /(?:^|\n)\s*user:\s*/gi;
      let lastMatch: RegExpExecArray | null = null;
      let m: RegExpExecArray | null;
      while ((m = userRe.exec(afterHeader)) !== null) lastMatch = m;
      const start = (lastMatch?.index ?? 0) + (lastMatch?.[0].length ?? 0);
      // Stop at the next assistant: turn if one follows, otherwise EOL/EOF.
      const tail = afterHeader.slice(start);
      const stopAt = tail.search(/\n\s*assistant:\s*/i);
      const userPrompt = stopAt === -1 ? tail : tail.slice(0, stopAt);
      out = (out.slice(0, headerMatch.index ?? 0) + userPrompt).trim();
    }
  }
  return out.trim();
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
  /** Parsed from workspace.yaml `created_at:` (ms since epoch). */
  createdAt?: number;
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
  firstPrompt?: string;
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
