import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MCP_LIMITS,
  type ToolDefinition,
  type ToolResult,
  type ToolCallContext,
  type GrantLevel,
} from './mcp-types';
import { paneBufferStore, PaneBufferStore } from './mcp-buffer-store';

/**
 * Tool registry for the cross-pane MCP server (v1, read-only).
 *
 * Two tiers:
 *  1. Buffer tools — work on any granted pane. Backed by the in-main
 *     `paneBufferStore` ring buffer.
 *  2. Session tools — work on agent panes the user has granted at the
 *     'session' level. Read structured Copilot CLI / Claude Code session
 *     state via the existing parsers (no new file walks here).
 *
 * Permission check is centralized in `requireGrant` so individual handlers
 * stay focused on their data path.
 */

function txt(s: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: s }], isError };
}

function clampPayload(s: string): string {
  if (s.length <= MCP_LIMITS.MAX_TOOL_RESULT_BYTES) return s;
  return s.slice(0, MCP_LIMITS.MAX_TOOL_RESULT_BYTES) +
    `\n…[truncated ${s.length - MCP_LIMITS.MAX_TOOL_RESULT_BYTES} bytes]`;
}

function requireGrant(
  ctx: ToolCallContext,
  targetPane: string,
  needed: GrantLevel,
): { ok: true } | { ok: false; reason: string } {
  const have = ctx.permissions.resolve(ctx.granteePane, targetPane);
  if (!have) {
    return { ok: false, reason: `no grant on pane '${targetPane}' (default-deny). The user must share it first.` };
  }
  if (needed === 'session' && have !== 'session') {
    return { ok: false, reason: `grant on pane '${targetPane}' is 'buffer' only; this tool requires 'session'.` };
  }
  return { ok: true };
}

// ── Tier 1: buffer tools ─────────────────────────────────────────────

const panesList: ToolDefinition = {
  name: 'panes.list',
  description:
    'List tmax panes the agent can see. Includes panes the agent itself ' +
    'occupies plus any panes the user has shared with this agent. Each entry ' +
    'reports id, title, cwd, pid, whether the pane hosts a recognized CLI ' +
    'agent, last process, last activity time, and last exit code.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  tier: 'buffer',
  handler: async (_args, ctx) => {
    const all = ctx.paneRegistry.list();
    const visible = all.filter((p) =>
      p.id === ctx.granteePane || ctx.permissions.resolve(ctx.granteePane, p.id) !== null,
    );
    const view = visible.map((p) => ({
      id: p.id,
      title: p.title,
      cwd: p.cwd,
      pid: p.pid,
      isAgent: p.isAgent,
      provider: p.provider,
      lastProcess: p.lastProcess,
      lastActivityTime: p.lastActivityTime ?? null,
      lastExitCode: p.lastExitCode,
      grantLevel: p.id === ctx.granteePane ? 'self' : ctx.permissions.resolve(ctx.granteePane, p.id),
    }));
    return txt(JSON.stringify(view, null, 2));
  },
};

const panesMetadata: ToolDefinition = {
  name: 'panes.metadata',
  description:
    'Return structured metadata about a single pane (title, cwd, pid, ' +
    'isAgent, provider, aiSessionId, lastProcess, lastActivityTime, ' +
    'lastExitCode). Lighter than panes.list when you already know the id.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Pane id from panes.list' } },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'buffer',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'buffer');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id);
    if (!info) return txt(`error: pane '${id}' not found`, true);
    return txt(JSON.stringify(info, null, 2));
  },
};

const panesTail: ToolDefinition = {
  name: 'panes.tail',
  description:
    'Return the last `n` lines of the pane buffer (default 200, max 2000). ' +
    'ANSI escape codes are stripped by default; pass raw:true to receive ' +
    'the original bytes.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Pane id' },
      n: { type: 'integer', minimum: 1, default: 200, description: 'Number of trailing lines' },
      raw: { type: 'boolean', default: false, description: 'Skip ANSI strip' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'buffer',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'buffer');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const requestedN = Math.max(1, Math.min(MCP_LIMITS.MAX_TAIL_LINES, Number(args.n ?? 200) | 0));
    const raw = args.raw === true;
    const data = paneBufferStore.getRaw(id);
    const lines = raw ? data.split('\n') : PaneBufferStore.toPlainLines(data);
    const slice = lines.slice(-requestedN);
    return txt(clampPayload(slice.join('\n')));
  },
};

const panesSearch: ToolDefinition = {
  name: 'panes.search',
  description:
    'Run a regex (JavaScript flavor) over the pane buffer and return the ' +
    'matching lines with 1-based line numbers. Returns at most `limit` ' +
    'matches (default 50). ANSI is stripped before matching.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Pane id' },
      pattern: { type: 'string', description: 'JS regex pattern (no enclosing slashes)' },
      flags: { type: 'string', default: 'i', description: 'Regex flags (defaults to "i")' },
      limit: { type: 'integer', minimum: 1, default: 50, description: 'Max matches to return' },
    },
    required: ['id', 'pattern'],
    additionalProperties: false,
  },
  tier: 'buffer',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    const pattern = String(args.pattern ?? '');
    const flags = typeof args.flags === 'string' ? args.flags : 'i';
    const limit = Math.max(1, Math.min(500, Number(args.limit ?? 50) | 0));
    if (!id) return txt('error: missing required argument "id"', true);
    if (!pattern) return txt('error: missing required argument "pattern"', true);
    if (pattern.length > 256) {
      // Cap the pattern length so a pathological caller-controlled regex
      // can't stall the main process. Buffer is bounded (256 KB) so the
      // worst case is short, but ReDoS-style backtracking on a giant
      // pattern could still spike CPU.
      return txt('error: pattern too long (max 256 chars)', true);
    }
    const grant = requireGrant(ctx, id, 'buffer');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (err) {
      return txt(`error: invalid regex: ${(err as Error).message}`, true);
    }
    const lines = PaneBufferStore.toPlainLines(paneBufferStore.getRaw(id));
    const out: string[] = [];
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      if (re.test(lines[i])) out.push(`${i + 1}: ${lines[i]}`);
    }
    if (out.length === 0) return txt('(no matches)');
    return txt(clampPayload(out.join('\n')));
  },
};

// ── Tier 2: session-state tools ──────────────────────────────────────

/**
 * Centralized provider-specific session-state path resolution. Pulled out
 * of every Tier-2 handler so a future change (e.g. respecting
 * CopilotSessionMonitor.getBasePath() instead of `~/.copilot/...`) only
 * touches one place.
 */
function copilotSessionDir(aiSessionId: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.copilot', 'session-state', aiSessionId);
}

function findClaudeCodeSessionFile(aiSessionId: string): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const base = path.join(home, '.claude', 'projects');
  try {
    for (const proj of fs.readdirSync(base, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue;
      const candidate = path.join(base, proj.name, `${aiSessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* base missing — no match */ }
  return null;
}

const sessionSummary: ToolDefinition = {
  name: 'panes.session.summary',
  description:
    'For a pane hosting a recognized CLI agent (Copilot CLI / Claude Code), ' +
    'return its session summary: status, message count, tool-call count, ' +
    'last activity time, latest user prompt, and total token usage. ' +
    'Requires a session-level grant.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Pane id' } },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (!info.isAgent || !info.aiSessionId || !info.provider) {
      return txt(`error: pane '${id}' is not bound to a known CLI agent session`, true);
    }
    // Lazy-import the parsers so we don't pay their cost at module load.
    if (info.provider === 'copilot') {
      const { parseSessionEvents } = await import('./copilot-events-parser');
      const eventsPath = path.join(copilotSessionDir(info.aiSessionId), 'events.jsonl');
      const parsed = parseSessionEvents(eventsPath);
      if (!parsed) return txt(`error: could not parse session at ${eventsPath}`, true);
      return txt(JSON.stringify({
        provider: 'copilot',
        sessionId: info.aiSessionId,
        cwd: info.cwd,
        status: parsed.status,
        messageCount: parsed.messageCount,
        toolCallCount: parsed.toolCallCount,
        pendingToolCalls: parsed.pendingToolCalls,
        totalTokens: parsed.totalTokens,
        lastActivityTime: parsed.lastActivityTime,
        latestPrompt: parsed.latestPrompt,
        latestPromptTime: parsed.latestPromptTime,
      }, null, 2));
    } else {
      const { parseClaudeCodeSession } = await import('./claude-code-events-parser');
      const target = findClaudeCodeSessionFile(info.aiSessionId);
      if (!target) return txt(`error: could not find Claude Code session file for ${info.aiSessionId}`, true);
      const parsed = parseClaudeCodeSession(target);
      if (!parsed) return txt(`error: could not parse Claude Code session at ${target}`, true);
      return txt(JSON.stringify({
        provider: 'claude-code',
        sessionId: info.aiSessionId,
        cwd: info.cwd,
        ...parsed,
      }, null, 2));
    }
  },
};

const sessionEvents: ToolDefinition = {
  name: 'panes.session.events',
  description:
    'Return the most recent N events from a recognized agent\'s session ' +
    'timeline. Each entry is { type, timestamp, data }. Default 50, max 500. ' +
    'Useful for spotting tool calls and recent prompts. Requires a ' +
    'session-level grant. Copilot CLI only in v1.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Pane id' },
      n: { type: 'integer', minimum: 1, default: 50 },
    },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (info.provider !== 'copilot' || !info.aiSessionId) {
      return txt('error: panes.session.events is Copilot CLI only in v1', true);
    }
    const n = Math.max(1, Math.min(500, Number(args.n ?? 50) | 0));
    const { parseSessionEvents } = await import('./copilot-events-parser');
    const eventsPath = path.join(copilotSessionDir(info.aiSessionId), 'events.jsonl');
    const parsed = parseSessionEvents(eventsPath);
    if (!parsed) return txt(`error: could not parse session at ${eventsPath}`, true);
    const tail = parsed.timeline.slice(-n);
    return txt(clampPayload(JSON.stringify(tail, null, 2)));
  },
};

const sessionCheckpointsList: ToolDefinition = {
  name: 'panes.session.checkpoints.list',
  description:
    'List checkpoints saved for a Copilot CLI agent\'s session: ' +
    '[{ number, title, createdAt }]. Requires a session-level grant. ' +
    'Copilot CLI only in v1.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Pane id' } },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (info.provider !== 'copilot' || !info.aiSessionId) {
      return txt('error: checkpoints are Copilot CLI only in v1', true);
    }
    const dir = path.join(copilotSessionDir(info.aiSessionId), 'checkpoints');
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return txt('[]');
    }
    const out: Array<{ number: number; title: string; createdAt: number }> = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      // Names look like `001-some-title.md`; pull the leading number.
      const m = e.name.match(/^(\d+)-(.+)\.md$/);
      if (!m) continue;
      try {
        const st = fs.statSync(path.join(dir, e.name));
        out.push({ number: parseInt(m[1], 10), title: m[2].replace(/-/g, ' '), createdAt: st.mtimeMs });
      } catch { /* skip unreadable entries */ }
    }
    out.sort((a, b) => a.number - b.number);
    return txt(JSON.stringify(out, null, 2));
  },
};

const sessionCheckpoint: ToolDefinition = {
  name: 'panes.session.checkpoint',
  description:
    'Return the markdown contents of a single checkpoint by number. ' +
    'Capped at 256 KB. Requires a session-level grant. Copilot CLI only.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Pane id' },
      number: { type: 'integer', minimum: 1, description: 'Checkpoint number' },
    },
    required: ['id', 'number'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    const num = Number(args.number);
    if (!id) return txt('error: missing required argument "id"', true);
    if (!Number.isFinite(num) || num < 1) return txt('error: invalid number', true);
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (info.provider !== 'copilot' || !info.aiSessionId) {
      return txt('error: checkpoints are Copilot CLI only in v1', true);
    }
    const dir = path.join(copilotSessionDir(info.aiSessionId), 'checkpoints');
    const padded = String(num).padStart(3, '0');
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* missing */ }
    const found = entries.find((e) => e.isFile() && e.name.startsWith(padded + '-') && e.name.endsWith('.md'));
    if (!found) return txt(`error: checkpoint ${num} not found`, true);
    return readBoundedFile(path.join(dir, found.name));
  },
};

const sessionFilesList: ToolDefinition = {
  name: 'panes.session.files.list',
  description:
    'List files saved alongside a Copilot CLI agent\'s session (the ' +
    '`files/` directory): [{ name, size, mtime }]. Requires session grant.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Pane id' } },
    required: ['id'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (info.provider !== 'copilot' || !info.aiSessionId) {
      return txt('error: session files are Copilot CLI only in v1', true);
    }
    const dir = path.join(copilotSessionDir(info.aiSessionId), 'files');
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return txt('[]'); }
    const out: Array<{ name: string; size: number; mtime: number }> = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      try {
        const st = fs.statSync(path.join(dir, e.name));
        out.push({ name: e.name, size: st.size, mtime: st.mtimeMs });
      } catch { /* skip */ }
    }
    return txt(JSON.stringify(out, null, 2));
  },
};

const sessionFile: ToolDefinition = {
  name: 'panes.session.file',
  description:
    'Return the contents of one file from the Copilot CLI session\'s ' +
    '`files/` directory by name. Read is capped at 256 KB. Names containing ' +
    'path separators are rejected (no traversal).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Pane id' },
      name: { type: 'string', description: 'File name (no path components)' },
    },
    required: ['id', 'name'],
    additionalProperties: false,
  },
  tier: 'session',
  handler: async (args, ctx) => {
    const id = String(args.id ?? '');
    const name = String(args.name ?? '');
    if (!id) return txt('error: missing required argument "id"', true);
    if (!name) return txt('error: missing required argument "name"', true);
    // Reject anything that isn't a single path component. `path.basename`
    // strips dirname; if the result differs from the input the caller
    // smuggled in a separator. Also block leading-dot path traversal.
    if (path.basename(name) !== name || name === '..' || name === '.') {
      return txt('error: file names must be a single path component', true);
    }
    const grant = requireGrant(ctx, id, 'session');
    if (!grant.ok) return txt(`error: ${grant.reason}`, true);
    const info = ctx.paneRegistry.get(id)!;
    if (info.provider !== 'copilot' || !info.aiSessionId) {
      return txt('error: session files are Copilot CLI only in v1', true);
    }
    const dir = path.join(copilotSessionDir(info.aiSessionId), 'files');
    const filePath = path.join(dir, name);
    // Defense in depth: confirm the resolved path still lives inside `dir`.
    // Symlinks or odd path semantics could otherwise punch out of the dir.
    const resolved = path.resolve(filePath);
    const dirResolved = path.resolve(dir) + path.sep;
    if (!resolved.startsWith(dirResolved)) {
      return txt('error: file resolves outside the session files directory', true);
    }
    return readBoundedFile(filePath);
  },
};

function readBoundedFile(filePath: string): ToolResult {
  try {
    const st = fs.statSync(filePath);
    if (st.size > MCP_LIMITS.MAX_FILE_BYTES) {
      // Return only the first MAX_FILE_BYTES so the agent can still inspect
      // the head of an oversized file. Reading the full thing would blow our
      // tool-result cap anyway.
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(MCP_LIMITS.MAX_FILE_BYTES);
        fs.readSync(fd, buf, 0, MCP_LIMITS.MAX_FILE_BYTES, 0);
        return txt(buf.toString('utf-8') + `\n…[truncated; original ${st.size} bytes]`);
      } finally {
        fs.closeSync(fd);
      }
    }
    return txt(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return txt(`error: ${(err as Error).message}`, true);
  }
}

export const allMcpTools: ToolDefinition[] = [
  panesList,
  panesMetadata,
  panesTail,
  panesSearch,
  sessionSummary,
  sessionEvents,
  sessionCheckpointsList,
  sessionCheckpoint,
  sessionFilesList,
  sessionFile,
];

export function findTool(name: string): ToolDefinition | undefined {
  return allMcpTools.find((t) => t.name === name);
}
