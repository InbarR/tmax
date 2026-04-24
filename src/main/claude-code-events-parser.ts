import * as fs from 'node:fs';
import type { CopilotSessionStatus } from '../shared/copilot-types';

/** Extract first text from message content (string or array of blocks). */
function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) return block.text.trim() || null;
    }
  }
  return null;
}

/**
 * Turn a raw first-prompt string into a summary suitable for the session list.
 * Handles the slash-command case: Claude Code injects the full command template
 * as the first "user message", producing garbage like
 * `<command-message>video-dub</command-message><command-name>video-dub</command-name>...`
 * which is useless as a title. When detected, surface it as `/<name> — <rest>`.
 */
function formatFirstPromptSummary(raw: string): string {
  let out = raw;
  const nameMatch = out.match(/<command-name>([^<]+)<\/command-name>/);
  if (nameMatch) {
    // Claude Code's tag content may or may not already include a leading slash
    // (e.g. "/video-dub" vs "video-dub"); normalize it.
    const name = nameMatch[1].replace(/^\/+/, '');
    const rest = stripCommandXml(out).replace(/^\/+/, '').trim();
    out = rest ? `/${name} — ${rest}` : `/${name}`;
  } else {
    // No command-name, but the message might still be a local-command-caveat
    // wrapper (injected when resuming a session). Strip it so the title shows
    // the real content instead of raw XML.
    const stripped = stripCommandXml(out).trim();
    if (stripped) out = stripped;
  }
  return out.slice(0, 120).replace(/\n/g, ' ');
}

/**
 * Strip Claude-Code internal XML wrappers (<command-*>, <local-command-*>,
 * etc.) together with their contents. Used to keep first-prompt summaries
 * readable.
 */
function stripCommandXml(s: string): string {
  // Matches any tag whose name contains "command", e.g. command-message,
  // command-name, command-args, local-command-caveat, local-command-stdout.
  return s.replace(/<([a-zA-Z-]*command[a-zA-Z-]*)\b[^>]*>[\s\S]*?<\/\1>/g, '');
}

export interface ClaudeCodeParsedSession {
  sessionId: string;
  slug: string;
  cwd: string;
  gitBranch: string;
  model: string;
  status: CopilotSessionStatus;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  firstPrompt: string;
  /** Most recent user prompt text (same cleanup as firstPrompt, skipping interruptions) */
  latestPrompt: string;
}

interface CacheEntry {
  byteOffset: number;
  metaExtracted: boolean;
  sessionId: string;
  slug: string;
  cwd: string;
  gitBranch: string;
  model: string;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  firstPrompt: string;
  latestPrompt: string;
  lastLineType: string;
  lastLineHasEndTurn: boolean;
  awaitingInput: boolean; // true after end_turn, cleared on next user message
}

const cache = new Map<string, CacheEntry>();

export function parseClaudeCodeSession(filePath: string): ClaudeCodeParsedSession | null {
  let fd: number | undefined;
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) return null;

    const cached = cache.get(filePath);
    const startOffset = cached?.byteOffset ?? 0;

    if (cached && startOffset >= fileSize) {
      return deriveResult(cached, stat.mtimeMs);
    }

    const bytesToRead = fileSize - startOffset;
    if (bytesToRead <= 0 && cached) {
      return deriveResult(cached, stat.mtimeMs);
    }
    if (bytesToRead <= 0) return null;

    const buffer = Buffer.alloc(bytesToRead);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, bytesToRead, startOffset);
    fs.closeSync(fd);
    fd = undefined;

    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter((l) => l.trim());

    const state: CacheEntry = cached
      ? { ...cached }
      : {
          byteOffset: 0,
          metaExtracted: false,
          sessionId: '',
          slug: '',
          cwd: '',
          gitBranch: '',
          model: '',
          messageCount: 0,
          toolCallCount: 0,
          lastActivityTime: 0,
          firstPrompt: '',
          latestPrompt: '',
          lastLineType: '',
          lastLineHasEndTurn: false,
          awaitingInput: false,
        };

    for (const line of lines) {
      processLine(line, state);
    }

    state.byteOffset = fileSize;
    cache.set(filePath, state);

    return deriveResult(state, stat.mtimeMs);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function extractType(line: string): string | null {
  // Fast extraction: match the first "type" field in the JSON line
  const m = line.match(/^\s*\{\s*"type"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  // Fallback for lines where "type" isn't the first field
  const m2 = line.match(/"type"\s*:\s*"([^"]+)"/);
  return m2 ? m2[1] : null;
}

function processLine(line: string, state: CacheEntry): void {
  const type = extractType(line);
  if (!type) return;

  state.lastLineType = type;
  state.lastLineHasEndTurn = false;
  if (type === 'user') state.awaitingInput = false;

  // Extract timestamp
  const tsMatch = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
  if (tsMatch) {
    const ts = new Date(tsMatch[1]).getTime();
    if (!isNaN(ts) && ts > state.lastActivityTime) {
      state.lastActivityTime = ts;
    }
  }

  switch (type) {
    case 'user': {
      state.messageCount++;

      // Pull the user-message text once and let both firstPrompt (set only if
      // empty) and latestPrompt (always updated on new input) consume it.
      // tool_result user messages don't have a readable text content, so
      // extractText returns null and we skip - otherwise every tool response
      // would clobber latestPrompt with an empty string.
      let userText: string | null = null;
      try {
        const parsed = JSON.parse(line);
        if (!state.metaExtracted) {
          state.cwd = parsed.cwd || '';
          state.gitBranch = parsed.gitBranch || '';
          state.slug = parsed.slug || '';
          state.sessionId = parsed.sessionId || '';
          state.metaExtracted = true;
        } else if (parsed.gitBranch) {
          // Branch may change during session
          state.gitBranch = parsed.gitBranch;
        }
        if (parsed.message?.content) {
          userText = extractText(parsed.message.content);
        }
      } catch {
        // Fallback: regex-based extraction (no user text available here)
        if (!state.metaExtracted) {
          const cwdMatch = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (cwdMatch) {
            try { state.cwd = JSON.parse(`"${cwdMatch[1]}"`); }
            catch { state.cwd = cwdMatch[1]; }
          }
          const slugMatch = line.match(/"slug"\s*:\s*"([^"]+)"/);
          if (slugMatch) state.slug = slugMatch[1];
          const branchMatch = line.match(/"gitBranch"\s*:\s*"([^"]+)"/);
          if (branchMatch) state.gitBranch = branchMatch[1];
          const sessionMatch = line.match(/"sessionId"\s*:\s*"([^"]+)"/);
          if (sessionMatch) state.sessionId = sessionMatch[1];
          state.metaExtracted = true;
        }
      }

      if (userText && !userText.startsWith('[Request interrupted')) {
        const summary = formatFirstPromptSummary(userText);
        if (summary) {
          if (!state.firstPrompt) state.firstPrompt = summary;
          state.latestPrompt = summary;
        }
      }
      break;
    }
    case 'assistant': {
      // Extract model
      const modelMatch = line.match(/"model"\s*:\s*"([^"]+)"/);
      if (modelMatch) state.model = modelMatch[1];

      // Count tool_use blocks (skip the outer "type":"assistant")
      const toolMatches = line.match(/"type"\s*:\s*"tool_use"/g);
      if (toolMatches) state.toolCallCount += toolMatches.length;

      // Check for end_turn
      if (line.includes('"end_turn"')) {
        state.lastLineHasEndTurn = true;
        state.awaitingInput = true;
      }
      break;
    }
    // progress, system, queue-operation, file-history-snapshot are not counted as messages
  }
}

const ACTIVE_THRESHOLD_MS = 30_000;

function deriveResult(
  state: CacheEntry,
  mtimeMs: number,
): ClaudeCodeParsedSession {
  const isRecent = Date.now() - mtimeMs < ACTIVE_THRESHOLD_MS;
  const isRecentWaiting = Date.now() - mtimeMs < 10 * 60_000; // 10 min for waiting states

  let status: CopilotSessionStatus = 'idle';

  if (isRecent || isRecentWaiting) {
    if (state.awaitingInput && isRecentWaiting) {
      // Assistant finished (end_turn) and no new user message — waiting for input
      status = 'waitingForUser';
    } else if (isRecent) {
      switch (state.lastLineType) {
        case 'progress':
          status = state.awaitingInput ? 'waitingForUser' : 'executingTool';
          break;
        case 'user':
          status = 'thinking';
          break;
        case 'assistant':
          status = state.lastLineHasEndTurn ? 'waitingForUser' : 'thinking';
          break;
        case 'system':
          status = 'waitingForUser';
          break;
        default:
          status = 'thinking';
          break;
      }
    }
  }

  return {
    sessionId: state.sessionId,
    slug: state.slug,
    cwd: state.cwd,
    gitBranch: state.gitBranch,
    model: state.model,
    status,
    messageCount: state.messageCount,
    toolCallCount: state.toolCallCount,
    lastActivityTime: state.lastActivityTime,
    firstPrompt: state.firstPrompt,
    latestPrompt: state.latestPrompt,
  };
}

export function extractClaudeCodePrompts(filePath: string, limit = 20): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const prompts: string[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.type === 'user' && o.message?.content) {
          const text = extractText(o.message.content);
          if (text) prompts.push(text.slice(0, 300).replace(/\n/g, ' '));
        }
      } catch { /* skip */ }
    }
    return prompts.slice(-limit);
  } catch {
    return [];
  }
}

export function clearClaudeCodeCache(filePath: string): void {
  cache.delete(filePath);
}
