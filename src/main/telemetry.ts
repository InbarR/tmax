import { app } from 'electron';
import Store from 'electron-store';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const TELEMETRY_LAST_PING_FILE = '.telemetry-last-ping';
const TELEMETRY_EVENT_TYPE = 'usage-ping';
const TELEMETRY_REPO_OWNER = 'InbarR';
const TELEMETRY_REPO_NAME = 'tmax';
const TELEMETRY_USER_AGENT = 'tmax-usage-telemetry';

type UsagePingPayload = {
  machineId: string;
  version: string;
  os: NodeJS.Platform;
  date: string;
};

type UsageDispatchBody = {
  event_type: typeof TELEMETRY_EVENT_TYPE;
  client_payload: UsagePingPayload;
};

type TelemetrySettings = {
  telemetry?: {
    enabled?: boolean;
  };
};

export function getLocalDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createAnonymousMachineId(hostname: string, username: string): string {
  return createHash('sha256')
    .update(`${hostname}${username}`)
    .digest('hex')
    .slice(0, 16);
}

function getTelemetryStore(): Store<TelemetrySettings> {
  return new Store<TelemetrySettings>({ name: 'tmax-config' });
}

function isTelemetryEnabled(): boolean {
  try {
    return getTelemetryStore().get('telemetry.enabled') !== false;
  } catch {
    return true;
  }
}

function getLastPingPath(): string {
  return path.join(app.getPath('userData'), TELEMETRY_LAST_PING_FILE);
}

async function readLastPingDate(filePath: string): Promise<string | null> {
  try {
    const value = await fs.readFile(filePath, 'utf8');
    const trimmed = value.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function writeLastPingDate(filePath: string, date: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, date, 'utf8');
  } catch {
    // Telemetry must never affect the app.
  }
}

function getUsagePingPayload(today: string): UsagePingPayload {
  let username = '';
  try {
    username = os.userInfo().username ?? '';
  } catch {
    username = '';
  }

  return {
    machineId: createAnonymousMachineId(os.hostname(), username),
    version: app.getVersion(),
    os: process.platform,
    date: today,
  };
}

async function getGhCliToken(): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile(
      'gh',
      ['auth', 'token'],
      { windowsHide: true, timeout: 2_000 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const token = stdout.trim();
        resolve(token || null);
      },
    );
  });
}

async function getGitHubToken(): Promise<string | null> {
  const ghToken = await getGhCliToken();
  if (ghToken) return ghToken;

  const envToken = process.env.GITHUB_TOKEN?.trim();
  return envToken || null;
}

async function postRepositoryDispatch(token: string, payload: UsageDispatchBody): Promise<boolean> {
  const body = JSON.stringify(payload);

  return await new Promise((resolve) => {
    const request = https.request(
      `https://api.github.com/repos/${TELEMETRY_REPO_OWNER}/${TELEMETRY_REPO_NAME}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': TELEMETRY_USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          resolve((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300);
        });
      },
    );

    request.on('error', () => resolve(false));
    request.write(body);
    request.end();
  });
}

export async function sendUsagePing(): Promise<void> {
  try {
    if (!isTelemetryEnabled()) return;

    const today = getLocalDateString();
    const lastPingPath = getLastPingPath();
    const lastPingDate = await readLastPingDate(lastPingPath);

    if (lastPingDate === today) return;

    const token = await getGitHubToken();
    if (!token) return;

    const sent = await postRepositoryDispatch(token, {
      event_type: TELEMETRY_EVENT_TYPE,
      client_payload: getUsagePingPayload(today),
    });

    if (sent) {
      await writeLastPingDate(lastPingPath, today);
    }
  } catch {
    // Telemetry must never affect the app.
  }
}
