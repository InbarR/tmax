import * as fs from 'node:fs';
import type { CopilotSessionStatus } from '../shared/copilot-types';

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
  lastLineType: string;
  lastLineHasEndTurn: boolean;
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
          lastLineType: '',
          lastLineHasEndTurn: false,
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

      if (!state.metaExtracted) {
        // Full JSON parse for the first user message to extract metadata
        try {
          const parsed = JSON.parse(line);
          state.cwd = parsed.cwd || '';
          state.gitBranch = parsed.gitBranch || '';
          state.slug = parsed.slug || '';
          state.sessionId = parsed.sessionId || '';

          // Extract first prompt text
          if (parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) {
                state.firstPrompt = block.text
                  .slice(0, 120)
                  .replace(/\n/g, ' ')
                  .trim();
                break;
              }
            }
          }
          state.metaExtracted = true;
        } catch {
          // Fallback: regex-based extraction
          const cwdMatch = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (cwdMatch) {
            try {
              state.cwd = JSON.parse(`"${cwdMatch[1]}"`);
            } catch {
              state.cwd = cwdMatch[1];
            }
          }
          const slugMatch = line.match(/"slug"\s*:\s*"([^"]+)"/);
          if (slugMatch) state.slug = slugMatch[1];
          const branchMatch = line.match(/"gitBranch"\s*:\s*"([^"]+)"/);
          if (branchMatch) state.gitBranch = branchMatch[1];
          const sessionMatch = line.match(/"sessionId"\s*:\s*"([^"]+)"/);
          if (sessionMatch) state.sessionId = sessionMatch[1];
          state.metaExtracted = true;
        }
      } else {
        // Update branch (may change during session)
        const branchMatch = line.match(/"gitBranch"\s*:\s*"([^"]+)"/);
        if (branchMatch) state.gitBranch = branchMatch[1];
      }
      break;
    }
    case 'assistant': {
      state.messageCount++;

      // Extract model
      const modelMatch = line.match(/"model"\s*:\s*"([^"]+)"/);
      if (modelMatch) state.model = modelMatch[1];

      // Count tool_use blocks (skip the outer "type":"assistant")
      const toolMatches = line.match(/"type"\s*:\s*"tool_use"/g);
      if (toolMatches) state.toolCallCount += toolMatches.length;

      // Check for end_turn
      if (line.includes('"end_turn"')) {
        state.lastLineHasEndTurn = true;
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

  let status: CopilotSessionStatus = 'idle';

  if (isRecent) {
    switch (state.lastLineType) {
      case 'progress':
        status = 'executingTool';
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
  };
}

export function clearClaudeCodeCache(filePath: string): void {
  cache.delete(filePath);
}
