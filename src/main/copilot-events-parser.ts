import * as fs from 'node:fs';
import type {
  CopilotSessionStatus,
} from '../shared/copilot-types';

export interface ParsedSessionEvents {
  status: CopilotSessionStatus;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  pendingToolCalls: number;
  totalTokens: number;
  /** Very first user.message text in the session - sticky once set. Used
   *  as the pane title hover tooltip and as the session's opening ask
   *  fallback when row.summary churns. */
  firstPrompt: string;
  latestPrompt: string;
  latestPromptTime: number;
}

/** Incremental state cache - stores aggregates, not raw events. */
interface ParserCache {
  byteOffset: number;
  status: CopilotSessionStatus;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  pendingToolCalls: number;
  totalTokens: number;
  firstPrompt: string;
  latestPrompt: string;
  latestPromptTime: number;
  /** Last N prompts for search, capped to avoid unbounded growth. */
  recentPrompts: string[];
}

const cache = new Map<string, ParserCache>();
const MAX_CACHED_PROMPTS = 20;

export function parseSessionEvents(eventsFilePath: string): ParsedSessionEvents | null {
  let fileHandle: number | undefined;
  try {
    const stat = fs.statSync(eventsFilePath);
    const fileSize = stat.size;

    const cached = cache.get(eventsFilePath);
    const startOffset = cached?.byteOffset ?? 0;

    if (cached && startOffset >= fileSize) {
      return cacheToResult(cached);
    }

    const bytesToRead = fileSize - startOffset;
    if (bytesToRead <= 0 && cached) {
      return cacheToResult(cached);
    }

    if (bytesToRead <= 0) {
      return null;
    }

    const buffer = Buffer.alloc(bytesToRead);
    fileHandle = fs.openSync(eventsFilePath, 'r');
    fs.readSync(fileHandle, buffer, 0, bytesToRead, startOffset);
    fs.closeSync(fileHandle);
    fileHandle = undefined;

    // Only process through the last '\n' so a partial-write tail isn't split
    // across two polls (both halves would fail to JSON.parse and be lost).
    const lastNewline = buffer.lastIndexOf(0x0a);
    const completeBytes = lastNewline === -1 ? 0 : lastNewline + 1;
    const newText = buffer.slice(0, completeBytes).toString('utf-8');
    const lines = newText.split('\n').filter((l) => l.trim().length > 0);

    // Update running state incrementally — no raw events stored
    const state: ParserCache = cached
      ? { ...cached }
      : {
          byteOffset: 0,
          status: 'idle',
          messageCount: 0,
          toolCallCount: 0,
          lastActivityTime: 0,
          pendingToolCalls: 0,
          totalTokens: 0,
          firstPrompt: '',
          latestPrompt: '',
          latestPromptTime: 0,
          recentPrompts: [],
        };

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        processEvent(raw, state);
      } catch {
        // skip malformed lines
      }
    }

    state.byteOffset = startOffset + completeBytes;
    cache.set(eventsFilePath, state);

    return cacheToResult(state);
  } catch {
    return null;
  } finally {
    if (fileHandle !== undefined) {
      try { fs.closeSync(fileHandle); } catch { /* ignore */ }
    }
  }
}

/** Process a single raw event into the running state. */
function processEvent(raw: Record<string, unknown>, state: ParserCache): void {
  const type = (raw.type as string) || 'unknown';
  const timestamp = raw.timestamp
    ? new Date(raw.timestamp as string).getTime()
    : Date.now();
  const data = raw.data as Record<string, unknown> | undefined;

  if (timestamp > state.lastActivityTime) {
    state.lastActivityTime = timestamp;
  }

  switch (type) {
    case 'session.start':
    case 'session.resume':
      state.status = 'idle';
      // GH #118: a fresh session must start with a clean tool-call counter -
      // a previous parse round (or stale cache state) could otherwise carry
      // pendingToolCalls > 0 into a new session and leave the pane stuck on
      // executingTool from the moment it starts.
      state.pendingToolCalls = 0;
      break;
    case 'assistant.turn_start':
      state.status = 'thinking';
      break;
    case 'assistant.turn_end':
      // Assistant finished its turn - the next move is the user's. Mark as
      // waitingForUser (mirroring Claude Code's end_turn handling) so the
      // pane status dot and the AI shimmer reflect that this session is
      // ready for input. Goes back to 'thinking' on the next user.message.
      state.status = 'waitingForUser';
      // GH #118: zero out pendingToolCalls on turn_end. The previous logic
      // relied solely on a matching tool.execution_complete to decrement
      // back to 0, but interruption / cancellation / Copilot crash leaves
      // tools "pending" forever - the pane status then sticks on
      // executingTool even though the turn is over.
      state.pendingToolCalls = 0;
      break;
    case 'user.message': {
      state.messageCount++;
      state.status = 'thinking';
      const text = String(data?.content || data?.transformedContent || '').trim();
      if (text) {
        if (!state.firstPrompt) state.firstPrompt = text.slice(0, 300);
        state.latestPrompt = text.slice(0, 120).replace(/\n/g, ' ');
        state.latestPromptTime = timestamp;
        state.recentPrompts.push(text.slice(0, 300));
        if (state.recentPrompts.length > MAX_CACHED_PROMPTS) {
          state.recentPrompts.shift();
        }
      }
      break;
    }
    case 'tool.execution_start':
      state.toolCallCount++;
      state.pendingToolCalls++;
      state.status = 'executingTool';
      break;
    case 'tool.execution_complete':
      if (state.pendingToolCalls > 0) state.pendingToolCalls--;
      if (state.pendingToolCalls === 0) state.status = 'thinking';
      break;
    case 'confirmation_request':
    case 'approval_request':
      state.status = 'awaitingApproval';
      break;
    case 'confirmation_response':
    case 'approval_response':
      state.status = 'thinking';
      break;
    case 'input_request':
    case 'user_input_request':
      state.status = 'waitingForUser';
      break;
    case 'token_usage':
      if (data) {
        const tokens = (data.total_tokens as number) || (data.totalTokens as number) || 0;
        if (tokens > 0) state.totalTokens = tokens;
      }
      break;
  }
}

// GH #118: mirror the Claude Code parser's ACTIVE_THRESHOLD_MS guard so a
// crashed / abandoned Copilot session can't show "executingTool" or
// "thinking" forever. If we haven't seen an event in this window, force
// the status back to idle - the Copilot CLI is no longer writing to the
// events log, so the pane is not actually busy.
const ACTIVE_THRESHOLD_MS = 30_000;

function cacheToResult(cached: ParserCache): ParsedSessionEvents {
  // Active = latest event seen recently. Use lastActivityTime if it was
  // populated (events carry timestamps); fall back to wall-clock skip
  // (no events ever = treat as fresh, status stays whatever the parser
  // decided).
  const isStale =
    cached.lastActivityTime > 0 &&
    Date.now() - cached.lastActivityTime > ACTIVE_THRESHOLD_MS;
  // Only downgrade "busy" statuses on staleness. waitingForUser is a valid
  // long-running state (assistant ended its turn, user hasn't responded
  // yet) and idle is already idle - no need to override either.
  const isBusy = cached.status === 'executingTool' || cached.status === 'thinking';
  return {
    status: isStale && isBusy ? 'idle' : cached.status,
    messageCount: cached.messageCount,
    toolCallCount: cached.toolCallCount,
    lastActivityTime: cached.lastActivityTime,
    pendingToolCalls: cached.pendingToolCalls,
    totalTokens: cached.totalTokens,
    firstPrompt: cached.firstPrompt,
    latestPrompt: cached.latestPrompt,
    latestPromptTime: cached.latestPromptTime,
  };
}

export function extractCopilotPrompts(eventsFilePath: string, limit = 20): string[] {
  // Use cached prompts from the parser if available (avoids re-reading the file)
  const cached = cache.get(eventsFilePath);
  if (cached && cached.recentPrompts.length > 0) {
    return cached.recentPrompts.slice(-limit);
  }
  // Fallback: read file (only for sessions not yet parsed)
  try {
    const content = fs.readFileSync(eventsFilePath, 'utf-8');
    const prompts: string[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.type === 'user.message') {
          const text = String(o.data?.content || o.data?.transformedContent || '').trim();
          if (text) prompts.push(text.slice(0, 300));
        }
      } catch { /* skip */ }
    }
    return prompts.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Like extractCopilotPrompts, but returns each user prompt paired with its
 * timestamp (epoch ms) for the session-timeline view. Reads the file directly
 * (timeline is opened on demand, not polled).
 */
export function extractCopilotPromptsWithTime(
  eventsFilePath: string,
  limit = 500,
): { text: string; time: number }[] {
  try {
    const content = fs.readFileSync(eventsFilePath, 'utf-8');
    const out: { text: string; time: number }[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.type !== 'user.message') continue;
        const text = String(o.data?.content || o.data?.transformedContent || '').trim();
        if (!text) continue;
        const time = o.timestamp ? new Date(o.timestamp).getTime() : 0;
        out.push({ text: text.slice(0, 2000), time });
      } catch { /* skip */ }
    }
    return out.slice(-limit);
  } catch {
    return [];
  }
}

export function clearParserCache(eventsFilePath: string): void {
  cache.delete(eventsFilePath);
}
