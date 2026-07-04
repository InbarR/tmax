import { app } from 'electron';
import Store from 'electron-store';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONNECTION_STRING =
  'InstrumentationKey=d1b7a379-cd3b-4721-aba9-a17c7ef7befa;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=608c32b6-5091-4828-b948-26ce9b41474d';

const TELEMETRY_LAST_PING_FILE = '.telemetry-last-ping';

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

export async function sendUsagePing(): Promise<void> {
  try {
    if (!isTelemetryEnabled()) return;

    const today = getLocalDateString();
    const lastPingPath = getLastPingPath();
    const lastPingDate = await readLastPingDate(lastPingPath);

    if (lastPingDate === today) return;

    let username = '';
    try {
      username = os.userInfo().username ?? '';
    } catch {
      username = '';
    }

    const machineId = createAnonymousMachineId(os.hostname(), username);

    // Lazy-load applicationinsights to avoid slowing down app startup
    const appInsights = await import('applicationinsights');
    const client = new appInsights.TelemetryClient(CONNECTION_STRING);
    client.config.disableAppInsights = false;
    client.config.noDiagnosticChannel = true;

    client.trackEvent({
      name: 'usage-ping',
      properties: {
        machineId,
        version: app.getVersion(),
        os: process.platform,
        date: today,
      },
    });

    // Flush and wait (with timeout so we never hang)
    await Promise.race([
      client.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);

    await writeLastPingDate(lastPingPath, today);
  } catch {
    // Telemetry must never affect the app.
  }
}
