import { app } from 'electron';
import Store from 'electron-store';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const CONNECTION_STRING =
  'InstrumentationKey=d1b7a379-cd3b-4721-aba9-a17c7ef7befa;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=608c32b6-5091-4828-b948-26ce9b41474d';

const TELEMETRY_LAST_PING_FILE = '.telemetry-last-ping';
const TELEMETRY_INSTALLED_MARKER = '.telemetry-installed';

// Schema version for the usage-ping event shape. Bump when you add/rename/remove
// properties so queries can distinguish old vs new event formats over time.
const TELEMETRY_SCHEMA_VERSION = 2;

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

// Hour-granularity dedup key, e.g. "2026-07-04T19". Used so the app pings at
// most once per clock hour per machine, no matter how many launches or how
// often the recurring schedule fires.
export function getLocalHourString(now: Date = new Date()): string {
  const hour = String(now.getHours()).padStart(2, '0');
  return `${getLocalDateString(now)}T${hour}`;
}

export function createAnonymousMachineId(hostname: string, username: string): string {
  return createHash('sha256')
    .update(`${hostname}${username}`)
    .digest('hex');
}

// Anonymous, non-reversible per-user id. Hashes the username on its own (not
// mixed with hostname) so we can count distinct users independently of machine:
// one user across two machines shares a userId, two users on one box differ.
// Never sends the raw username.
export function createAnonymousUserId(username: string): string {
  return createHash('sha256').update(username).digest('hex');
}

// Best-effort organization domain, in clear text. On Windows the raw domain
// comes from the domain-join env vars; on macOS/Linux there is no reliable
// equivalent, so this returns ''. Sends the full domain (e.g.
// "middleeast.corp.microsoft.com") so queries can see the exact org/forest.
export function getOrgDomain(env: NodeJS.ProcessEnv = process.env): string {
  return (env.USERDNSDOMAIN || env.USERDOMAIN || '').trim().toLowerCase();
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

// Detect (and record) whether this is the first time telemetry has run on this
// machine. Uses a dedicated marker file, separate from the hourly dedup file, so
// deleting the dedup file to force a ping does not reset first-run detection.
async function consumeFirstRunFlag(): Promise<boolean> {
  const markerPath = path.join(app.getPath('userData'), TELEMETRY_INSTALLED_MARKER);
  try {
    await fs.access(markerPath);
    return false; // marker exists => not first run
  } catch {
    // Marker missing => first run. Record it so future runs are not "first".
    try {
      await fs.mkdir(path.dirname(markerPath), { recursive: true });
      await fs.writeFile(markerPath, new Date().toISOString(), 'utf8');
    } catch {
      // If we can't write, still report first run this once; harmless.
    }
    return true;
  }
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

function parseConnectionString(cs: string): { iKey: string; ingestionEndpoint: string } {
  const parts: Record<string, string> = {};
  for (const kv of cs.split(';')) {
    const idx = kv.indexOf('=');
    if (idx > 0) {
      parts[kv.slice(0, idx).trim().toLowerCase()] = kv.slice(idx + 1).trim();
    }
  }
  const iKey = parts['instrumentationkey'] ?? '';
  const ingestionEndpoint = (parts['ingestionendpoint'] ?? 'https://dc.services.visualstudio.com/').replace(
    /\/+$/,
    '',
  );
  return { iKey, ingestionEndpoint };
}

// Post a single Application Insights event via a plain HTTPS request to the
// ingestion REST endpoint. Resolves true on a 2xx response, false on any error,
// timeout, or non-2xx. This deliberately avoids the applicationinsights /
// OpenTelemetry SDK: in a packaged Electron app that SDK auto-starts collectors
// and forks helper processes off the app binary (tmax.exe), which snowballed
// into a runaway spawn loop. A dependency-free POST cannot spawn anything.
function postUsageEvent(ingestionEndpoint: string, envelope: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const body = Buffer.from(JSON.stringify(envelope), 'utf8');
      const url = new URL(`${ingestionEndpoint}/v2/track`);
      const req = https.request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
          timeout: 5_000,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          res.on('data', () => {});
          res.on('end', () => done(status >= 200 && status < 300));
          res.on('error', () => done(false));
        },
      );
      req.on('error', () => done(false));
      req.on('timeout', () => {
        req.destroy();
        done(false);
      });
      req.write(body);
      req.end();
    } catch {
      done(false);
    }
  });
}

export async function sendUsagePing(): Promise<void> {
  try {
    if (!isTelemetryEnabled()) return;

    const nowDate = new Date();
    const hourBucket = getLocalHourString(nowDate);
    const lastPingPath = getLastPingPath();
    const lastPingKey = await readLastPingDate(lastPingPath);

    if (lastPingKey === hourBucket) return;

    let username = '';
    try {
      username = os.userInfo().username ?? '';
    } catch {
      username = '';
    }

    const machineId = createAnonymousMachineId(os.hostname(), username);
    const userId = createAnonymousUserId(username);
    const isFirstRun = await consumeFirstRunFlag();

    let locale = '';
    try {
      locale = app.getLocale() || '';
    } catch {
      locale = '';
    }

    let timezone = '';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      timezone = '';
    }

    // Product OS version, cross-platform: on macOS this returns the marketing
    // version (e.g. "14.5"), NOT the Darwin kernel that os.release() reports
    // (e.g. "23.5.0"). On Windows both are the build number. We keep os.release()
    // separately as kernelVersion for the occasional low-level debugging need.
    let osVersion = '';
    try {
      osVersion = process.getSystemVersion?.() || os.release();
    } catch {
      osVersion = os.release();
    }

    const { iKey, ingestionEndpoint } = parseConnectionString(CONNECTION_STRING);
    if (!iKey) return;

    const envelope = {
      name: 'Microsoft.ApplicationInsights.Event',
      time: nowDate.toISOString(),
      iKey,
      tags: {
        'ai.cloud.role': 'tmax',
        'ai.application.ver': app.getVersion(),
      },
      data: {
        baseType: 'EventData',
        baseData: {
          ver: 2,
          name: 'usage-ping',
          properties: {
            machineId,
            userId,
            os: process.platform,
            osVersion,
            kernelVersion: os.release(),
            arch: process.arch,
            locale,
            timezone,
            domain: getOrgDomain(),
            isFirstRun: String(isFirstRun),
            uptimeSec: String(Math.round(process.uptime())),
            telemetrySchema: String(TELEMETRY_SCHEMA_VERSION),
            date: getLocalDateString(nowDate),
            hour: hourBucket,
          },
        },
      },
    };

    // Send, but never hang: postUsageEvent resolves on its own 5s timeout.
    // Only record the hour as "done" when the send actually succeeded, so a
    // failed send (offline, timeout, 5xx) is retried on the next hourly tick
    // instead of silently burning the hour.
    const ok = await postUsageEvent(ingestionEndpoint, envelope);
    if (ok) {
      await writeLastPingDate(lastPingPath, hourBucket);
    }
  } catch {
    // Telemetry must never affect the app.
  }
}

const USAGE_PING_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Start the recurring usage-ping schedule: one ping shortly after startup, then
// once an hour for as long as the app runs. The per-hour dedup in sendUsagePing
// guarantees at most one event per clock hour even across restarts. The timer is
// unref'd so it never keeps the process alive on its own, and everything is
// swallowed so telemetry can never affect or crash the app.
export function startUsagePingSchedule(
  initialDelayMs = 5000,
  intervalMs = USAGE_PING_INTERVAL_MS,
): () => void {
  const safePing = (): void => {
    try {
      void sendUsagePing().catch(() => {});
    } catch {
      // sendUsagePing is async and already guarded, but never let a synchronous
      // throw (e.g. from scheduling internals) escape into the app.
    }
  };

  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  try {
    startTimer = setTimeout(safePing, initialDelayMs);
    if (startTimer && typeof startTimer.unref === 'function') startTimer.unref();

    intervalTimer = setInterval(safePing, intervalMs);
    if (intervalTimer && typeof intervalTimer.unref === 'function') intervalTimer.unref();
  } catch {
    // Scheduling must never crash startup.
  }

  return () => {
    try {
      if (startTimer) clearTimeout(startTimer);
      if (intervalTimer) clearInterval(intervalTimer);
    } catch {
      // ignore
    }
  };
}
