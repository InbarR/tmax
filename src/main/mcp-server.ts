import * as http from 'node:http';
import * as crypto from 'node:crypto';
import {
  type AuditEntry,
  type PaneRegistryAPI,
  type PermissionsAPI,
  type ToolCallContext,
  type ToolDefinition,
} from './mcp-types';
import { allMcpTools, findTool } from './mcp-tools';
import { audit as writeAudit } from './mcp-audit';
import { diagLog } from './diag-logger';

/**
 * Cross-pane MCP server (v1).
 *
 * Transport
 * ---------
 * Plain HTTP POST on `127.0.0.1:<random>`. The body is a JSON-RPC 2.0
 * request implementing the subset of MCP we need:
 *   - `initialize`   → server info + capability advertisement
 *   - `tools/list`   → list of available tools
 *   - `tools/call`   → invoke a tool with arguments
 *
 * We avoid the full Streamable HTTP transport (with SSE) for v1 simplicity —
 * tools/call is single request/response anyway. Notifications and progress
 * events are out of scope (those land in v2).
 *
 * Auth
 * ----
 * Per-pane bearer tokens. tmax issues a token when it spawns the agent's
 * PTY, injects it into the env (`MCP_TMAX_TOKEN`), and binds it server-side
 * to that pane id. The token identifies *the calling agent's pane*, which
 * the permissions store needs to resolve grants.
 *
 * Connections that bind to the loopback interface only. Non-loopback
 * connections are rejected at the request layer as a defense in depth, even
 * though Node binds to 127.0.0.1.
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL_ERROR = -32603;

const MAX_REQUEST_BYTES = 64 * 1024;

export interface McpServerOptions {
  permissions: PermissionsAPI;
  paneRegistry: PaneRegistryAPI;
  /**
   * Called every time the server fields a tool call, for the renderer's
   * audit viewer. Optional; the file-backed audit is wired separately.
   */
  onAudit?: (entry: AuditEntry) => void;
}

interface PaneToken {
  paneId: string;
  token: string;
}

export class McpServer {
  private server: http.Server | null = null;
  private port = 0;
  /** When false, the server still listens but rejects every request with 503. */
  private enabled = true;
  /** token → paneId (the grantee). */
  private tokens = new Map<string, string>();
  /** paneId → token. So we can revoke when a pane closes. */
  private paneTokens = new Map<string, string>();
  private readonly opts: McpServerOptions;

  constructor(opts: McpServerOptions) { this.opts = opts; }

  isRunning(): boolean { return this.server !== null; }

  /** Listening URL or null if stopped. */
  url(): string | null {
    return this.server ? `http://127.0.0.1:${this.port}` : null;
  }

  /**
   * Toggle the kill switch. We deliberately do NOT close/reopen the listener:
   * if we did, every PTY env we previously injected would point at a stale
   * port and a stale token. Instead we keep the socket bound and the token
   * map intact; `handleRequest` short-circuits to 503 while disabled. This
   * means flipping the switch back on is instant and existing agent panes
   * keep working without restart.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = !!enabled;
  }

  isEnabled(): boolean { return this.enabled; }

  /**
   * Issue (or refresh) a bearer token for a pane. Called when tmax spawns
   * an agent PTY; the token is then injected into the PTY env so the
   * agent's MCP client picks it up automatically.
   */
  issueToken(paneId: string): PaneToken {
    const existing = this.paneTokens.get(paneId);
    if (existing) {
      return { paneId, token: existing };
    }
    const token = crypto.randomBytes(24).toString('base64url');
    this.tokens.set(token, paneId);
    this.paneTokens.set(paneId, token);
    return { paneId, token };
  }

  /** Drop the token bound to a pane (called on pane close / agent exit). */
  revokeToken(paneId: string): void {
    const tok = this.paneTokens.get(paneId);
    if (!tok) return;
    this.tokens.delete(tok);
    this.paneTokens.delete(paneId);
  }

  async start(): Promise<{ url: string }> {
    if (this.server) return { url: this.url()! };
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          diagLog('mcp:request-error', { error: String(err) });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: JSONRPC_INTERNAL_ERROR, message: 'internal error' } }));
          }
        });
      });
      server.on('error', reject);
      // Bind to loopback only — never expose the listener on a routable iface.
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('mcp: failed to determine listening address'));
          return;
        }
        this.server = server;
        this.port = addr.port;
        diagLog('mcp:started', { url: this.url() });
        resolve({ url: this.url()! });
      });
    });
  }

  /**
   * Permanently shut the listener down. Only called at app exit — the
   * kill-switch path uses `setEnabled(false)` instead so existing PTY env
   * vars stay valid.
   */
  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    this.server = null;
    this.tokens.clear();
    this.paneTokens.clear();
    await new Promise<void>((resolve) => {
      s.close(() => resolve());
    });
    diagLog('mcp:stopped', {});
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Defense-in-depth: reject anything that isn't loopback.
    const remote = req.socket.remoteAddress || '';
    if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1' && remote !== '::1') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    if (!this.enabled) {
      // Kill switch flipped — refuse every call but keep the listener bound
      // so we don't leak the port and so agents recover instantly when the
      // user re-enables.
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('mcp disabled');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'POST' });
      res.end('method not allowed');
      return;
    }
    const auth = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
    if (!m) {
      res.writeHead(401, { 'Content-Type': 'text/plain', 'WWW-Authenticate': 'Bearer' });
      res.end('missing bearer token');
      return;
    }
    const granteePane = this.tokens.get(m[1]);
    if (!granteePane) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('invalid token');
      return;
    }

    const body = await readBody(req);
    if (body === null) {
      this.sendJsonRpc(res, null, { error: { code: JSONRPC_PARSE_ERROR, message: 'request too large' } });
      return;
    }
    let parsed: JsonRpcRequest | null = null;
    try { parsed = JSON.parse(body) as JsonRpcRequest; } catch {
      this.sendJsonRpc(res, null, { error: { code: JSONRPC_PARSE_ERROR, message: 'parse error' } });
      return;
    }
    if (!parsed || parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string') {
      this.sendJsonRpc(res, parsed?.id ?? null, { error: { code: JSONRPC_INVALID_REQUEST, message: 'invalid request' } });
      return;
    }

    // Per JSON-RPC 2.0, a request with no `id` is a notification: the server
    // MUST NOT send a response. We need to handle the side-effect (if any)
    // but stay quiet on the wire.
    const isNotification = parsed.id === undefined || parsed.id === null;
    const id = parsed.id ?? null;

    const respond = (body: { result?: unknown; error?: { code: number; message: string; data?: unknown } }) => {
      if (isNotification) {
        // Acknowledge the HTTP layer so the client doesn't hang.
        if (!res.headersSent) { res.writeHead(204); res.end(); }
        return;
      }
      this.sendJsonRpc(res, id, body);
    };

    try {
      switch (parsed.method) {
        case 'initialize':
          respond({ result: this.handleInitialize() });
          return;
        case 'tools/list':
          respond({ result: this.handleToolsList() });
          return;
        case 'tools/call':
          respond({ result: await this.handleToolsCall(parsed.params ?? {}, granteePane) });
          return;
        case 'notifications/initialized':
          // Pure notification. No response per spec.
          if (!res.headersSent) { res.writeHead(204); res.end(); }
          return;
        case 'ping':
          respond({ result: {} });
          return;
        default:
          respond({ error: { code: JSONRPC_METHOD_NOT_FOUND, message: `method not found: ${parsed.method}` } });
          return;
      }
    } catch (err) {
      respond({ error: { code: JSONRPC_INTERNAL_ERROR, message: (err as Error).message } });
    }
  }

  private handleInitialize(): unknown {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tmax-cross-pane-mcp', version: '1.0.0' },
      capabilities: {
        tools: { listChanged: false },
      },
    };
  }

  private handleToolsList(): unknown {
    return {
      tools: allMcpTools.map((t: ToolDefinition) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        // Non-standard hint so MCP clients can hide / preview which grant
        // level a tool will need before the user attempts to invoke it.
        _meta: { tier: t.tier },
      })),
    };
  }

  private async handleToolsCall(params: Record<string, unknown>, granteePane: string): Promise<unknown> {
    const name = String(params.name ?? '');
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const tool = findTool(name);
    if (!tool) {
      // tools/call returns an error result rather than throwing for unknown
      // tools — clients usually want to surface this in the chat, not bail.
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
    }
    const startedAt = Date.now();
    let result;
    let auditError: string | undefined;
    let okFlag = true;
    try {
      const ctx: ToolCallContext = {
        granteePane,
        permissions: this.opts.permissions,
        paneRegistry: this.opts.paneRegistry,
        audit: () => { /* per-call audit handled below */ },
      };
      result = await tool.handler(args, ctx);
      if (result.isError) okFlag = false;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      auditError = msg;
      okFlag = false;
      result = { content: [{ type: 'text', text: `error: ${msg}` }], isError: true };
    }
    const ms = Date.now() - startedAt;
    const targetPane = String(args.id ?? '');
    const argsSummary = summarizeArgs(args);
    const entry: AuditEntry = {
      ts: Date.now(),
      granteePane,
      targetPane,
      tool: name,
      argsSummary,
      ok: okFlag,
      ms,
      error: auditError,
    };
    writeAudit(entry);
    this.opts.onAudit?.(entry);
    return result;
  }

  private sendJsonRpc(
    res: http.ServerResponse,
    id: string | number | null,
    body: { result?: unknown; error?: { code: number; message: string; data?: unknown } },
  ): void {
    const payload: JsonRpcResponse = { jsonrpc: '2.0', id, ...body };
    const json = JSON.stringify(payload);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  }
}

function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BYTES) {
        // Drain and signal "too large" by resolving null.
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function summarizeArgs(args: Record<string, unknown>): string {
  // Keep audit lines compact — long pattern strings or names are clipped.
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    let s: string;
    if (typeof v === 'string') s = v.length > 80 ? v.slice(0, 77) + '...' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else s = '[obj]';
    parts.push(`${k}=${s}`);
  }
  return parts.join(' ');
}
