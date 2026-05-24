import { IPty, spawn } from 'node-pty';
import { existsSync, statSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { diagLog, sanitize } from './diag-logger';

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
  // TASK-158: caller-supplied flag so the manager can track how many WSL
  // PTYs are alive without re-parsing shell paths. The wiring in main.ts
  // sets this from `opts.wslDistro != null || profile.path === 'wsl.exe'`.
  isWsl?: boolean;
}

export interface PtyCallbacks {
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number | undefined) => void;
  // TASK-158: fires when the count of live WSL PTYs transitions across
  // zero. Used by main.ts to lazy-start/stop the WslSessionManager so
  // vmmemWSL isn't pinned alive when no WSL terminal is open.
  onWslActiveChanged?: (active: boolean) => void;
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
  // TASK-158: track which PTY ids correspond to WSL shells. We fire
  // onWslActiveChanged across the 0<->1 transitions so the WSL session
  // manager can lazy-start when a WSL terminal opens and lazy-stop when
  // the last one closes.
  private wslPtyIds = new Set<string>();

  constructor(callbacks: PtyCallbacks) {
    this.callbacks = callbacks;
  }

  hasWslPty(): boolean {
    return this.wslPtyIds.size > 0;
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
    // Expand a leading ~ so users can type ~/repos in Settings → Default
    // Start Folder without having to spell out the full home path. Without
    // this, existsSync(~) fails and we silently fall through to homedir(),
    // which makes the setting look broken to Mac/Linux users.
    if (cwd && (cwd === '~' || cwd.startsWith('~/') || cwd.startsWith('~\\'))) {
      cwd = join(homedir(), cwd.slice(1));
    }
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
    // TASK-158: register before firing onWslActiveChanged so the callback
    // sees `hasWslPty() === true` if it queries us.
    if (opts.isWsl) {
      const wasEmpty = this.wslPtyIds.size === 0;
      this.wslPtyIds.add(opts.id);
      if (wasEmpty) {
        try { this.callbacks.onWslActiveChanged?.(true); }
        catch (err) { diagLog('pty:wsl-active-cb-failed', { error: String(err) }); }
      }
    }
    diagLog('pty:created', { id: opts.id, pid: ptyProcess.pid, shell: opts.shellPath, cwd });
    // CMD: relies on prompt regex fallback (no hook mechanism)

    // Inject shell integration for zsh (precmd hook for OSC 7)
    // zsh doesn't support PROMPT_COMMAND; use precmd_functions array instead.
    //
    // Many zsh prompt themes (oh-my-zsh, p10k variants) populate their cwd
    // segment from a `chpwd` hook that only fires after an actual `cd`.
    // tmax spawns the shell directly into the target cwd via the PTY, so
    // no `cd` happens and the prompt's cwd segment stays empty until the
    // user manually changes folder. The injected precmd fires `chpwd` and
    // every `chpwd_functions` entry exactly once on the first prompt so
    // theme state is populated. Guarded by _TMAX_CHPWD_FIRED so it only
    // runs on the first prompt and doesn't double-trigger thereafter.
    if (!shellName.includes('wsl') && shellName.includes('zsh') && !shellName.includes('pwsh')) {
      const zshSnippet = `__tmax_precmd() { printf '\\e]7;file:///%s\\a' "$PWD"; if [[ -z "$_TMAX_CHPWD_FIRED" ]]; then _TMAX_CHPWD_FIRED=1; (( \${+functions[chpwd]} )) && chpwd; [[ -n "\${chpwd_functions+x}" ]] && for _f in "\${chpwd_functions[@]}"; do (( \${+functions[\$_f]} )) && "$_f"; done; fi }; precmd_functions+=(__tmax_precmd)`;
      setTimeout(() => ptyProcess.write(zshSnippet + '\r'), 200);
      setTimeout(() => ptyProcess.write('clear\r'), 400);
    }

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
      this.releaseWslSlot(opts.id);
      this.callbacks.onExit(opts.id, exitCode);
    });

    return { id: opts.id, pid: ptyProcess.pid };
  }

  // TASK-158: drop a PTY from the WSL set and notify on the N->0 edge.
  // Centralized so kill() and the onExit handler both go through the same
  // path - a missed call here means the manager stays warm forever.
  private releaseWslSlot(id: string): void {
    if (!this.wslPtyIds.delete(id)) return;
    if (this.wslPtyIds.size === 0) {
      try { this.callbacks.onWslActiveChanged?.(false); }
      catch (err) { diagLog('pty:wsl-active-cb-failed', { error: String(err) }); }
    }
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
      this.releaseWslSlot(id);
    }
  }

  killAll(): void {
    for (const [id, pty] of this.ptys) {
      pty.kill();
      this.ptys.delete(id);
      this.releaseWslSlot(id);
    }
  }
}
