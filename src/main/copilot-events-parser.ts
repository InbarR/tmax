import * as fs from 'node:fs';
import type {
  CopilotSessionStatus,
  CopilotActivityEntry,
} from '../shared/copilot-types';

export interface ParsedSessionEvents {
  status: CopilotSessionStatus;
  messageCount: number;
  toolCallCount: number;
  lastActivityTime: number;
  timeline: CopilotActivityEntry[];
  pendingToolCalls: number;
  totalTokens: number;
}

interface ParserCache {
  byteOffset: number;
  events: EventRecord[];
}

interface EventRecord {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

const cache = new Map<string, ParserCache>();

export function parseSessionEvents(eventsFilePath: string): ParsedSessionEvents | null {
  let fileHandle: number | undefined;
  try {
    const stat = fs.statSync(eventsFilePath);
    const fileSize = stat.size;

    const cached = cache.get(eventsFilePath);
    const startOffset = cached?.byteOffset ?? 0;
    const existingEvents = cached?.events ?? [];

    if (startOffset >= fileSize && existingEvents.length > 0) {
      return deriveState(existingEvents);
    }

    const bytesToRead = fileSize - startOffset;
    if (bytesToRead <= 0 && existingEvents.length > 0) {
      return deriveState(existingEvents);
    }

    if (bytesToRead <= 0) {
      return null;
    }

    const buffer = Buffer.alloc(bytesToRead);
    fileHandle = fs.openSync(eventsFilePath, 'r');
    fs.readSync(fileHandle, buffer, 0, bytesToRead, startOffset);
    fs.closeSync(fileHandle);
    fileHandle = undefined;

    const newText = buffer.toString('utf-8');
    const lines = newText.split('\n').filter((l) => l.trim().length > 0);

    const newEvents: EventRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        newEvents.push(normalizeEvent(parsed));
      } catch {
        // skip malformed lines
      }
    }

    const allEvents = [...existingEvents, ...newEvents];
    cache.set(eventsFilePath, { byteOffset: fileSize, events: allEvents });

    return deriveState(allEvents);
  } catch {
    return null;
  } finally {
    if (fileHandle !== undefined) {
      try { fs.closeSync(fileHandle); } catch { /* ignore */ }
    }
  }
}

export function extractCopilotPrompts(eventsFilePath: string, limit = 20): string[] {
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

export function clearParserCache(eventsFilePath: string): void {
  cache.delete(eventsFilePath);
}

function normalizeEvent(raw: Record<string, unknown>): EventRecord {
  const type = (raw.type as string) || 'unknown';
  const timestamp = raw.timestamp
    ? new Date(raw.timestamp as string).getTime()
    : Date.now();

  return { type, timestamp, data: raw.data as Record<string, unknown> | undefined };
}

function deriveState(events: EventRecord[]): ParsedSessionEvents {
  let status: CopilotSessionStatus = 'idle';
  let messageCount = 0;
  let toolCallCount = 0;
  let lastActivityTime = 0;
  let pendingToolCalls = 0;
  let totalTokens = 0;

  for (const event of events) {
    if (event.timestamp > lastActivityTime) {
      lastActivityTime = event.timestamp;
    }

    switch (event.type) {
      // Session lifecycle
      case 'session.start':
      case 'session.resume':
        status = 'idle';
        break;

      // Assistant turns
      case 'assistant.turn_start':
        status = 'thinking';
        break;
      case 'assistant.turn_end':
        status = 'idle';
        break;

      // Messages
      case 'user.message':
        messageCount++;
        status = 'thinking';
        break;
      case 'assistant.message':
        messageCount++;
        break;

      // Tool execution
      case 'tool.execution_start':
        toolCallCount++;
        pendingToolCalls++;
        status = 'executingTool';
        break;
      case 'tool.execution_complete':
        if (pendingToolCalls > 0) pendingToolCalls--;
        if (pendingToolCalls === 0) status = 'thinking';
        break;

      // Confirmation / approval
      case 'confirmation_request':
      case 'approval_request':
        status = 'awaitingApproval';
        break;
      case 'confirmation_response':
      case 'approval_response':
        status = 'thinking';
        break;

      // Input requests
      case 'input_request':
      case 'user_input_request':
        status = 'waitingForUser';
        break;

      // Token usage
      case 'token_usage':
        if (event.data) {
          const tokens = (event.data.total_tokens as number) || (event.data.totalTokens as number) || 0;
          if (tokens > 0) totalTokens = tokens;
        }
        break;
    }
  }

  const timeline: CopilotActivityEntry[] = events.slice(-50).map((e) => ({
    type: e.type,
    timestamp: e.timestamp,
    data: e.data,
  }));

  return {
    status,
    messageCount,
    toolCallCount,
    lastActivityTime,
    timeline,
    pendingToolCalls,
    totalTokens,
  };
}
