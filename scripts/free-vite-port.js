#!/usr/bin/env node
// Free a stale Vite dev-server port left behind by a previous `npm start`.
// Runs as the `prestart` hook so `npm start` no longer fails with
// "Port 5995 is already in use" when the prior session was killed roughly.
//
// Safety: only kills node/electron processes that own the port. Skips anything
// else (e.g., a dev tool the user intentionally bound to that port).

const { execSync, execFileSync } = require('node:child_process');

const port = Number(process.env.TMAX_VITE_PORT) || 5995;

function getPidsWindows(p) {
  let out = '';
  try {
    out = execSync(`netstat -ano -p TCP`, { encoding: 'utf8', timeout: 3000 });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    // e.g. "  TCP    0.0.0.0:5995    0.0.0.0:0    LISTENING    99304"
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (m && Number(m[1]) === p) pids.add(Number(m[2]));
  }
  return [...pids];
}

function getPidsUnix(p) {
  try {
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function getProcName(pid) {
  if (process.platform === 'win32') {
    // execFileSync (no shell) so /FI isn't translated by Git Bash/MSYS and
    // quoting can't be mangled by whatever script-shell npm is using.
    try {
      const out = execFileSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', timeout: 3000, windowsHide: true },
      );
      const m = out.match(/^"([^"]+)"/m);
      if (m) return m[1].toLowerCase();
    } catch { /* fall through to PowerShell */ }
    // PowerShell fallback: tasklist sometimes returns no match for live PIDs
    // (slow CSV parse, racy exit, restricted access). Get-Process uses a
    // different API and is far more reliable.
    try {
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`],
        { encoding: 'utf8', timeout: 5000, windowsHide: true },
      );
      return out.trim().toLowerCase();
    } catch {
      return '';
    }
  }
  try {
    const out = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8', timeout: 3000 });
    return out.trim().toLowerCase();
  } catch {
    return '';
  }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore', timeout: 3000, windowsHide: true });
    } else {
      execFileSync('kill', ['-9', String(pid)], { stdio: 'ignore', timeout: 3000 });
    }
    return true;
  } catch {
    return false;
  }
}

const pids = process.platform === 'win32' ? getPidsWindows(port) : getPidsUnix(port);
if (pids.length === 0) process.exit(0);

for (const pid of pids) {
  const name = getProcName(pid);
  // Only kill node/electron — never anything else binding the port.
  if (!/^(node|electron|tmax)/i.test(name)) {
    console.log(`[free-vite-port] Port ${port} held by ${name || 'unknown'} (pid ${pid}); not killing.`);
    continue;
  }
  const ok = killPid(pid);
  console.log(`[free-vite-port] ${ok ? 'Killed' : 'Failed to kill'} stale ${name} (pid ${pid}) on port ${port}`);
}
