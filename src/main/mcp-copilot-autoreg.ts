import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Auto-registers tmax as an MCP server in the user's Copilot CLI / Claude
 * Code config files so the agent connects to us without the user having to
 * type `/mcp add` by hand.
 *
 * Strategy
 * --------
 * - Write an entry named `tmax` into `~/.copilot/mcp-config.json` (and the
 *   legacy `~/.copilot/.mcp.json` mirror) with `type: "http"`, the current
 *   listening URL, and an `Authorization: Bearer ${MCP_TMAX_TOKEN}` header.
 * - The token uses env-var substitution so a single config entry works for
 *   *every* agent pane — each pane's PTY is launched with its own
 *   per-pane MCP_TMAX_TOKEN value (see pty-manager.ts), and the MCP HTTP
 *   server resolves token → grantee pane.
 * - The URL is rewritten on every app launch because the listening port
 *   is ephemeral (`listen(0)`).
 * - On clean app exit the entry is removed so we don't leave a dangling
 *   `tmax` server pointing at a dead port.
 *
 * The function is intentionally best-effort: if the file is missing /
 * malformed / read-only we log and move on. We never throw.
 */

const ENTRY_NAME = 'tmax';

const COPILOT_CONFIG_PATHS = [
  // Order matters: the canonical file first, the legacy mirror second.
  '.copilot/mcp-config.json',
  '.copilot/.mcp.json',
];

function configFiles(): string[] {
  const home = os.homedir();
  return COPILOT_CONFIG_PATHS.map((rel) => path.join(home, ...rel.split('/')));
}

function buildEntry(url: string) {
  return {
    type: 'http' as const,
    url,
    headers: {
      Authorization: 'Bearer ${MCP_TMAX_TOKEN}',
    },
    tools: ['*'],
  };
}

function readJson(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return { mcpServers: {} };
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return { mcpServers: {} };
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[mcp-autoreg] failed to read ${p}:`, err);
    return null;
  }
}

function writeJson(p: string, data: any): boolean {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return true;
  } catch (err) {
    console.warn(`[mcp-autoreg] failed to write ${p}:`, err);
    return false;
  }
}

/**
 * Install / refresh the tmax entry in every recognized agent config file.
 * Idempotent: re-running with the same URL is a no-op modulo file mtime.
 */
export function installTmaxEntry(url: string): void {
  const entry = buildEntry(url);
  for (const file of configFiles()) {
    const cfg = readJson(file);
    if (!cfg) continue;
    if (typeof cfg !== 'object' || Array.isArray(cfg)) continue;
    if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
      cfg.mcpServers = {};
    }
    const prev = cfg.mcpServers[ENTRY_NAME];
    // Skip rewrite when nothing meaningful changed — avoids touching mtime
    // on every app start and helps file watchers stay quiet.
    if (
      prev &&
      prev.type === entry.type &&
      prev.url === entry.url &&
      prev.headers?.Authorization === entry.headers.Authorization
    ) {
      continue;
    }
    cfg.mcpServers[ENTRY_NAME] = entry;
    if (writeJson(file, cfg)) {
      console.log(`[mcp-autoreg] installed '${ENTRY_NAME}' in ${file}`);
    }
  }
}

/** Remove the tmax entry. Called on graceful app exit. */
export function uninstallTmaxEntry(): void {
  for (const file of configFiles()) {
    const cfg = readJson(file);
    if (!cfg || typeof cfg !== 'object') continue;
    if (!cfg.mcpServers || !(ENTRY_NAME in cfg.mcpServers)) continue;
    delete cfg.mcpServers[ENTRY_NAME];
    if (writeJson(file, cfg)) {
      console.log(`[mcp-autoreg] removed '${ENTRY_NAME}' from ${file}`);
    }
  }
}

/**
 * Best-effort PTY-side nudge: when the user grants a pane access, send a
 * literal `/mcp\r` to the grantee pane's PTY so the running Copilot CLI
 * re-renders its MCP status (and, on agents that support it, hot-reloads
 * the server list). If the agent already had tmax connected at startup,
 * this is a harmless visual refresh.
 */
export function buildReloadKeystroke(): string {
  // Carriage return only — Enter on a TTY is `\r`, not `\r\n`. Two CRs so
  // any partially-typed input is committed first then `/mcp` runs cleanly.
  return '\r/mcp\r';
}
