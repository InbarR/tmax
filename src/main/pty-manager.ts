import { IPty, spawn } from 'node-pty';
import { existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { diagLog, sanitize } from './diag-logger';

export interface PtyCreateOpts {
  id: string;
  shellPath: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
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

    // Build env with shell integration: emit OSC 7 after every prompt so the
    // renderer can track the terminal's current working directory reliably.
    const baseEnv = sanitizeEnv(opts.env ?? (process.env as Record<string, string>));
    const shellName = opts.shellPath.toLowerCase();
    const shellEnv: Record<string, string> = { TERM_PROGRAM: 'tmax', COLORTERM: 'truecolor' };

    // Set PROMPT_COMMAND via env var for native bash/zsh (not WSL — shell init takes longer).
    // Bash reads PROMPT_COMMAND from env natively; zsh honors it via most
    // frameworks (oh-my-zsh, prezto, etc.). Setting it as an env var avoids
    // writing visible text into the terminal.
    if (!shellName.includes('wsl') && (shellName.includes('bash') || shellName.includes('zsh'))) {
      shellEnv.PROMPT_COMMAND = 'printf "\\e]7;file:///%s\\a" "$(pwd)"';
    }

    const ptyProcess = spawn(opts.shellPath, opts.args, {
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

    // Inject shell integration for PowerShell (needs to write to terminal)
    if (shellName.includes('pwsh') || shellName.includes('powershell')) {
      // PowerShell: append to the prompt function to emit OSC 7 (file URI)
      const psSnippet = [
        '$__tmax_origPrompt = $function:prompt;',
        'function prompt { ',
        '  $p = $__tmax_origPrompt.Invoke();',
        '  $d = $executionContext.SessionState.Path.CurrentLocation.Path;',
        '  $u = "file:///" + ($d -replace "\\\\","/");',
        '  [Console]::Write("`e]7;$u`a");',
        '  return $p',
        '}',
      ].join(' ');
      // Send as a single line + Enter, then clear screen to hide the init noise
      setTimeout(() => ptyProcess.write(psSnippet + '\r'), 200);
      setTimeout(() => ptyProcess.write('cls\r'), 400);
    }
    // CMD: relies on prompt regex fallback (no hook mechanism)

    ptyProcess.onData((data) => {
      const s = this.stats.get(opts.id);
      if (s) { s.dataCount++; s.lastDataTime = Date.now(); s.dataBytes += data.length; }
      diagLog('pty:data', { id: opts.id, bytes: data.length });
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
      this.callbacks.onExit(opts.id, exitCode);
    });

    return { id: opts.id, pid: ptyProcess.pid };
  }

  write(id: string, data: string): void {
    const pty = this.ptys.get(id);
    if (pty) {
      const s = this.stats.get(id);
      if (s) { s.writeCount++; s.lastWriteTime = Date.now(); }
      diagLog('pty:write', { id, bytes: data.length, preview: sanitize(data) });
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
    }
  }

  killAll(): void {
    for (const [id, pty] of this.ptys) {
      pty.kill();
      this.ptys.delete(id);
    }
  }
}
