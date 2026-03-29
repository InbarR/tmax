import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export interface WslDistroInfo {
  name: string;
  home: string;
  claudeBasePath: string;
  copilotBasePath: string;
}

const WSL_LOCALHOST = '\\\\wsl.localhost';
const WSL_EXE = 'wsl.exe';

let cachedDistros: WslDistroInfo[] | null = null;

export function isWslAvailable(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    return existsSync(path.join(systemRoot, 'System32', WSL_EXE));
  } catch {
    return false;
  }
}

function getInstalledDistros(): string[] {
  try {
    const raw = execFileSync(WSL_EXE, ['-l', '-q'], {
      encoding: 'utf16le',
      timeout: 10_000,
      windowsHide: true,
    });

    return raw
      .replace(/\0/g, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('Windows Subsystem'));
  } catch {
    return [];
  }
}

function getDistroHome(distro: string): string | null {
  try {
    const raw = execFileSync(WSL_EXE, ['-d', distro, '-e', '/bin/sh', '-c', 'echo $HOME'], {
      encoding: 'utf-8',
      timeout: 10_000,
      windowsHide: true,
    });

    const home = raw.replace(/\0/g, '').trim();
    return home.length > 0 && home.startsWith('/') ? home : null;
  } catch {
    return null;
  }
}

function buildUncPath(distro: string, linuxPath: string): string {
  // Convert forward slashes to backslashes for the Windows UNC path portion
  const winSegment = linuxPath.replace(/\//g, '\\');
  return `${WSL_LOCALHOST}\\${distro}${winSegment}`;
}

export async function getWslDistroInfo(): Promise<WslDistroInfo[]> {
  if (cachedDistros !== null) return cachedDistros;

  if (!isWslAvailable()) {
    cachedDistros = [];
    return cachedDistros;
  }

  const names = getInstalledDistros();
  const results: WslDistroInfo[] = [];

  for (const name of names) {
    const home = getDistroHome(name);
    if (!home) continue;

    results.push({
      name,
      home,
      claudeBasePath: buildUncPath(name, `${home}/.claude/projects`),
      copilotBasePath: buildUncPath(name, `${home}/.copilot/session-state`),
    });
  }

  // Only cache non-empty results — if WSL returned nothing, the service may
  // not be ready yet, so retry on the next call
  if (results.length > 0) {
    cachedDistros = results;
  }
  return results;
}

export function wslUncToLinux(uncPath: string, distro: string): string {
  const prefix = `${WSL_LOCALHOST}\\${distro}`;
  if (!uncPath.startsWith(prefix)) {
    throw new Error(`Path does not start with expected prefix: ${prefix}`);
  }
  return uncPath.slice(prefix.length).replace(/\\/g, '/');
}

export function linuxToWslUnc(linuxPath: string, distro: string): string {
  return buildUncPath(distro, linuxPath);
}

export function clearWslCache(): void {
  cachedDistros = null;
}
