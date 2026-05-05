import { IPty, spawn } from 'node-pty';
import { existsSync, statSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { diagLog, sanitize } from './diag-logger';
import { paneBufferStore } from './mcp/buffer-store';
import { paneRegistry } from './mcp/pane-registry';

// Dot-sourced by each pwsh session so the full snippet isn't echoed into the terminal.
// Rewritten once per app launch (stable filename, overwrite).
const PS_INTEGRATION_PATH = join(tmpdir(), 'tmax-pwsh-integration.ps1');
// `& $sb` is used instead of `$sb.Invoke()` because oh-my-posh and similar
// prompt providers rely on module-level state that .Invoke() can't reach
// across scopes - matches the VS Code pwsh-integration pattern.
const PS_INTEGRATION_CONTENT =
  '$Global:__tmax_origPrompt = $function:prompt\n' +
  'function Global:prompt {\n' +
  '  $p = & $Global:__tmax_origPrompt\n' +
  '  $d = $executionContext.SessionState.Path.CurrentLocation.Path\n' +
  '  $u = "file:///" + ($d -replace "\\\\","/")\n' +
  '  [Console]::Write("`e]7;$u`a")\n' +
  '  return $p\n' +
  '}\n';
let psIntegrationAvailable = false;
try {
  writeFileSync(PS_INTEGRATION_PATH, PS_INTEGRATION_CONTENT, 'utf8');
  psIntegrationAvailable = true;
} catch (err) {
  diagLog('pty:ps-integration-init-failed', { error: String(err) });
}

export interface PtyCreateOpts {
  id: string;
  shellPath: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  /**
   * Cross-pane MCP env vars to inject into the spawned PTY. Issued by
   * main when this pane is being launched as an agent host (or eligible to
   * become one). The agent's MCP client picks them up automatically; ordinary
   * shells just see two harmless env vars.
   */
  mcpEnv?: { url: string; token: string };
}

export interface PtyCallbacks {
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number | undefined) => void;
}

// Electron injects env vars that break Node.js child processes (npm, npx, etc.)
// Security-sensitive vars that could hijack spawned shells are also blocked.
const ELECTRON_ENV_BLOCKLIST = new Set([
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_ENABLE_LOGGING',
  'ELECTRON_ENABLE_STACK_DUMPING',
  'ELECTRON_DEFAULT_ERROR_MODE',
  'ELECTRON_OVERRIDE_DIST_PATH',
  'GOOGLE_API_KEY',
  'GOOGLE_DEFAULT_CLIENT_ID',
  'GOOGLE_DEFAULT_CLIENT_SECRET',
  'ORIGINAL_XDG_CURRENT_DESKTOP',
  'NODE_OPTIONS',
  // Security: prevent library injection via spawned shells
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'NODE_EXTRA_CA_CERTS',
]);

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (ELECTRON_ENV_BLOCKLIST.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export interface PtyStats {
  pid: number;
  writeCount: number;
  lastWriteTime: number;
  dataCount: number;
  lastDataTime: number;
  dataBytes: number;
}

const BATCH_INTERVAL = 12; // ms — flush PTY output batches (~1 frame at 60fps + margin)

export class PtyManager {
  private ptys = new Map<string, IPty>();
  private stats = new Map<string, PtyStats>();
  private callbacks: PtyCallbacks;
  private pendingData = new Map<string, string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: PtyCallbacks) {
    this.callbacks = callbacks;
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      for (const [id, data] of this.pendingData) {
        this.callbacks.onData(id, data);
      }
      this.pendingData.clear();
    }, BATCH_INTERVAL);
  }

  getStats(id: string): PtyStats | null {
    return this.stats.get(id) ?? null;
  }

  create(opts: PtyCreateOpts): { id: string; pid: number } {
    // Validate cwd is an existing directory; fall back to home dir
    let cwd = opts.cwd;
    try {
      if (!cwd || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
        cwd = homedir();
      }
    } catch {
      cwd = homedir();
    }

    const baseEnv = sanitizeEnv(opts.env ?? (process.env as Record<string, string>));
    const shellName = opts.shellPath.toLowerCase();
    const shellEnv: Record<string, string> = { TERM_PROGRAM: 'tmax', COLORTERM: 'truecolor' };

    // Cross-pane MCP env injection. The agent's MCP client picks these up
    // automatically; we additionally surface MCP_TMAX_PANE_ID so tools can
    // self-identify in logs / chat.
    if (opts.mcpEnv) {
      shellEnv.MCP_TMAX_URL = opts.mcpEnv.url;
      shellEnv.MCP_TMAX_TOKEN = opts.mcpEnv.token;
      shellEnv.MCP_TMAX_PANE_ID = opts.id;
    }

    // Set PROMPT_COMMAND via env var for native bash (not WSL — shell init takes longer)
    // zsh doesn't support PROMPT_COMMAND; it uses precmd hooks injected below via PTY write
    if (!shellName.includes('wsl') && shellName.includes('bash') && !shellName.includes('zsh')) {
      shellEnv.PROMPT_COMMAND = 'printf "\\e]7;file:///%s\\a" "$(pwd)"';
    }

    // PowerShell shell integration via launch args (VS Code pattern).
    // -NoExit + -Command run our init script silently during pwsh startup, after the
    // profile loads. Nothing is typed, so nothing echoes into the terminal buffer.
    // Skip if user has -Command/-File in their custom args to avoid clobbering.
    let finalArgs = opts.args;
    const isPowerShell = shellName.includes('pwsh') || shellName.includes('powershell');
    const userHasCustomCommand = opts.args.some(
      (a) => /^-(Command|c|File|f|EncodedCommand)$/i.test(a),
    );
    if (isPowerShell && psIntegrationAvailable && !userHasCustomCommand) {
      const escapedPath = PS_INTEGRATION_PATH.replace(/'/g, "''");
      finalArgs = [...opts.args, '-NoExit', '-Command', `. '${escapedPath}'`];
    }

    const ptyProcess = spawn(opts.shellPath, finalArgs, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      useConpty: true,
      env: { ...baseEnv, ...shellEnv },
    });

    this.ptys.set(opts.id, ptyProcess);
    this.stats.set(opts.id, { pid: ptyProcess.pid, writeCount: 0, lastWriteTime: 0, dataCount: 0, lastDataTime: 0, dataBytes: 0 });
    diagLog('pty:created', { id: opts.id, pid: ptyProcess.pid, shell: opts.shellPath, cwd });
    // Register with the MCP-side pane registry so cross-pane tools can see
    // this pane immediately, even before the renderer reports its title.
    try { paneRegistry.register(opts.id, ptyProcess.pid, cwd); } catch { /* swallow */ }
    // CMD: relies on prompt regex fallback (no hook mechanism)

    // Inject shell integration for zsh (precmd hook for OSC 7)
    // zsh doesn't support PROMPT_COMMAND; use precmd_functions array instead
    if (!shellName.includes('wsl') && shellName.includes('zsh') && !shellName.includes('pwsh')) {
      const zshSnippet = `__tmax_precmd() { printf '\\e]7;file:///%s\\a' "$PWD" }; precmd_functions+=(__tmax_precmd)`;
      setTimeout(() => ptyProcess.write(zshSnippet + '\r'), 200);
      setTimeout(() => ptyProcess.write('clear\r'), 400);
    }

    ptyProcess.onData((data) => {
      const s = this.stats.get(opts.id);
      if (s) { s.dataCount++; s.lastDataTime = Date.now(); s.dataBytes += data.length; }
      diagLog('pty:data', { id: opts.id, bytes: data.length });
      // Mirror PTY data into the cross-pane MCP ring buffer so other agents
      // can read it via panes.tail / panes.search.
      paneBufferStore.append(opts.id, data);
      // Batch output: accumulate chunks and flush at most once per BATCH_INTERVAL.
      // This prevents IPC flooding during output bursts (e.g. system resume).
      const existing = this.pendingData.get(opts.id);
      this.pendingData.set(opts.id, existing ? existing + data : data);
      this.scheduleBatchFlush();
    });

    ptyProcess.onExit(({ exitCode }) => {
      diagLog('pty:exit', { id: opts.id, exitCode });
      this.ptys.delete(opts.id);
      this.stats.delete(opts.id);
      paneBufferStore.setExit(opts.id, exitCode);
      // Drop the pane from the MCP-side registry too. Without this, panes
      // whose shell exited naturally (e.g. user typed `exit`, or the pwsh
      // shell was replaced by an agent process) linger as stale rows in
      // the cross-pane MCP grants dialog.
      try { paneRegistry.unregister(opts.id); } catch { /* swallow */ }
      this.callbacks.onExit(opts.id, exitCode);
    });

    return { id: opts.id, pid: ptyProcess.pid };
  }

  write(id: string, data: string): void {
    const pty = this.ptys.get(id);
    if (pty) {
      const s = this.stats.get(id);
      if (s) { s.writeCount++; s.lastWriteTime = Date.now(); }
      diagLog('pty:write', { id, bytes: data.length });
      pty.write(data);
    } else {
      diagLog('pty:write:no-pty', { id, bytes: data.length });
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const pty = this.ptys.get(id);
    if (pty) {
      diagLog('pty:resize', { id, cols, rows });
      pty.resize(cols, rows);
    }
  }

  /** Re-send current size to all PTYs to wake up stalled ConPTY pipes */
  resizeAll(): void {
    for (const [, pty] of this.ptys) {
      try {
        pty.resize(pty.cols, pty.rows);
      } catch { /* ignore dead ptys */ }
    }
  }

  getPid(id: string): number | null {
    return this.stats.get(id)?.pid ?? null;
  }

  kill(id: string): void {
    const pty = this.ptys.get(id);
    if (pty) {
      pty.kill();
      this.ptys.delete(id);
      this.pendingData.delete(id);
      // Pane is gone — drop it from the MCP-side registry too. The buffer
      // is dropped inside paneRegistry.unregister().
      paneRegistry.unregister(id);
    }
  }

  killAll(): void {
    for (const [id, pty] of this.ptys) {
      pty.kill();
      this.ptys.delete(id);
      paneRegistry.unregister(id);
    }
  }
}
