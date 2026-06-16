// TASK-176 / GH #118: AI session parsers were reporting wrong status -
// Copilot stuck on `executingTool`, Claude Code stuck on `waitingForUser`.
//
// These are pure-function tests against the parsers; we write fake JSONL
// files and assert that the parser-returned status reflects what the
// session is actually doing - no Electron.
import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseSessionEvents,
  clearParserCache,
} from '../../../src/main/copilot-events-parser';
import { parseClaudeCodeSession } from '../../../src/main/claude-code-events-parser';

function writeJsonl(filePath: string, lines: Record<string, unknown>[]): void {
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

function tmpJsonl(name: string): string {
  return path.join(os.tmpdir(), `tmax-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

describe('Copilot CLI parser - pendingToolCalls + staleness (GH #118)', () => {
  test('assistant.turn_end with pending tools resets pendingToolCalls and unsticks executingTool', () => {
    const file = tmpJsonl('copilot-pending');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'session.start', timestamp: now },
      { type: 'assistant.turn_start', timestamp: now },
      { type: 'tool.execution_start', timestamp: now },
      { type: 'tool.execution_start', timestamp: now },
      // assistant.turn_end fires before either tool completes - this is the
      // interruption / cancellation scenario from GH #118.
      { type: 'assistant.turn_end', timestamp: now },
    ]);
    try {
      clearParserCache(file);
      const result = parseSessionEvents(file);
      expect(result).not.toBeNull();
      expect(result!.pendingToolCalls).toBe(0);
      // Status should NOT be executingTool any more.
      expect(result!.status).not.toBe('executingTool');
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });

  test('session.resume zeros pendingToolCalls left over from previous parse', () => {
    const file = tmpJsonl('copilot-resume');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'tool.execution_start', timestamp: now },
      { type: 'session.resume', timestamp: now },
    ]);
    try {
      clearParserCache(file);
      const result = parseSessionEvents(file);
      expect(result).not.toBeNull();
      expect(result!.pendingToolCalls).toBe(0);
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });

  test('stale session (no events in > 30s) reports idle even if last status was executingTool', () => {
    const file = tmpJsonl('copilot-stale');
    // Timestamp the events ~60s in the past so the staleness threshold trips.
    const stale = new Date(Date.now() - 60_000).toISOString();
    writeJsonl(file, [
      { type: 'session.start', timestamp: stale },
      { type: 'tool.execution_start', timestamp: stale },
      // No completion event - parser previously left status on executingTool
      // forever. With the staleness fallback, this should now read as idle.
    ]);
    try {
      clearParserCache(file);
      const result = parseSessionEvents(file);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('idle');
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });

  test('fresh in-flight tool call still reports executingTool', () => {
    const file = tmpJsonl('copilot-fresh');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'session.start', timestamp: now },
      { type: 'assistant.turn_start', timestamp: now },
      { type: 'tool.execution_start', timestamp: now },
    ]);
    try {
      clearParserCache(file);
      const result = parseSessionEvents(file);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('executingTool');
      expect(result!.pendingToolCalls).toBe(1);
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });
});

describe('Claude Code parser - awaitingInput clear (GH #118)', () => {
  test('progress event after end_turn clears awaitingInput', () => {
    const file = tmpJsonl('claude-progress');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'user', timestamp: now, message: { content: 'hi' } },
      { type: 'assistant', timestamp: now, stop_reason: 'end_turn' },
      // After end_turn, a progress event flows in - this is the GH #118
      // case where the parser used to stay stuck on waitingForUser.
      { type: 'progress', timestamp: now },
    ]);
    try {
      const result = parseClaudeCodeSession(file);
      expect(result).not.toBeNull();
      expect(result!.status).not.toBe('waitingForUser');
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });

  test('end_turn alone (no follow-up event) still reports waitingForUser', () => {
    const file = tmpJsonl('claude-endturn');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'user', timestamp: now, message: { content: 'hi' } },
      { type: 'assistant', timestamp: now, stop_reason: 'end_turn' },
    ]);
    try {
      const result = parseClaudeCodeSession(file);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('waitingForUser');
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });

  test('non-end_turn assistant line after end_turn clears the flag (assistant resumed talking)', () => {
    const file = tmpJsonl('claude-assistant-resume');
    const now = new Date().toISOString();
    writeJsonl(file, [
      { type: 'user', timestamp: now, message: { content: 'hi' } },
      { type: 'assistant', timestamp: now, stop_reason: 'end_turn' },
      // Assistant talks again (no end_turn) - should NOT be waitingForUser.
      { type: 'assistant', timestamp: now, model: 'claude' },
    ]);
    try {
      const result = parseClaudeCodeSession(file);
      expect(result).not.toBeNull();
      expect(result!.status).not.toBe('waitingForUser');
    } finally {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
  });
});
