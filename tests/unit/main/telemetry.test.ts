import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockStoreGet = vi.fn();
const mockGetPath = vi.fn();
const mockGetVersion = vi.fn();
const mockHostname = vi.fn();
const mockUserInfo = vi.fn();
const mockRelease = vi.fn();
const mockGetLocale = vi.fn();
const mockAccess = vi.fn();
const mockRequest = vi.fn();

let lastRequestOptions: { method?: string; hostname?: string; path?: string } | undefined;
let lastRequestBody: Buffer | undefined;

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
    getVersion: mockGetVersion,
    getLocale: mockGetLocale,
  },
}));

vi.mock('electron-store', () => ({
  default: class MockStore {
    get(key: string) {
      return mockStoreGet(key);
    }
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
  },
}));

vi.mock('node:os', () => ({
  default: {
    hostname: mockHostname,
    userInfo: mockUserInfo,
    release: mockRelease,
  },
}));

vi.mock('node:https', () => ({
  default: {
    request: mockRequest,
  },
}));

describe('telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockGetPath.mockReturnValue('C:\\Users\\me\\AppData\\Roaming\\tmax');
    mockGetVersion.mockReturnValue('1.11.2');
    mockGetLocale.mockReturnValue('en-US');
    mockStoreGet.mockReturnValue(undefined);
    mockHostname.mockReturnValue('test-host');
    mockUserInfo.mockReturnValue({ username: 'test-user' });
    mockRelease.mockReturnValue('10.0.22631');
    mockReadFile.mockRejectedValue(new Error('missing'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    // Default: first-run marker already exists (not first run) unless a test overrides.
    mockAccess.mockResolvedValue(undefined);

    lastRequestOptions = undefined;
    lastRequestBody = undefined;
    mockRequest.mockImplementation(
      (options: { method?: string; hostname?: string; path?: string }, cb?: (res: unknown) => void) => {
        lastRequestOptions = options;
        const res = {
          statusCode: 200,
          on: (event: string, handler: () => void) => {
            if (event === 'end') queueMicrotask(handler);
            return res;
          },
        };
        if (cb) cb(res);
        const req = {
          on: () => req,
          write: (body: Buffer) => {
            lastRequestBody = body;
          },
          end: () => {},
          destroy: () => {},
        };
        return req;
      },
    );
  });

  test('creates a stable anonymous machine id', async () => {
    const { createAnonymousMachineId } = await import('../../../src/main/telemetry');

    expect(createAnonymousMachineId('host', 'user')).toBe(
      '8d0ac992bcd4ae1407f1bf92f5d62368438075e8a8bf06fbb4e20bff22fd250a',
    );
    expect(createAnonymousMachineId('host', 'user')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('creates a stable anonymous user id independent of hostname', async () => {
    const { createAnonymousUserId, createAnonymousMachineId } = await import('../../../src/main/telemetry');

    const idA = createAnonymousUserId('user');
    // Same username on a different host => same userId (machine-independent).
    expect(createAnonymousUserId('user')).toBe(idA);
    expect(idA).toMatch(/^[0-9a-f]{64}$/);
    // userId must NOT equal the machineId (different hashing inputs).
    expect(idA).not.toBe(createAnonymousMachineId('host', 'user'));
    // Different usernames => different userIds.
    expect(createAnonymousUserId('other')).not.toBe(idA);
  });

  test('sends the full org domain in clear text', async () => {
    const { getOrgDomain } = await import('../../../src/main/telemetry');

    expect(getOrgDomain({ USERDNSDOMAIN: 'middleeast.corp.microsoft.com' })).toBe(
      'middleeast.corp.microsoft.com',
    );
    expect(getOrgDomain({ USERDNSDOMAIN: 'MIDDLEEAST.CORP.MICROSOFT.COM' })).toBe(
      'middleeast.corp.microsoft.com',
    );
    expect(getOrgDomain({ USERDOMAIN: 'REDMOND' })).toBe('redmond');
    expect(getOrgDomain({})).toBe('');
  });

  test('sends a ping via the App Insights ingestion endpoint and records the day', async () => {
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    await sendUsagePing();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(lastRequestOptions?.method).toBe('POST');
    expect(lastRequestOptions?.hostname).toBe('eastus-8.in.applicationinsights.azure.com');
    expect(lastRequestOptions?.path).toBe('/v2/track');

    const envelope = JSON.parse((lastRequestBody as Buffer).toString('utf8'));
    expect(envelope.name).toBe('Microsoft.ApplicationInsights.Event');
    expect(envelope.iKey).toBe('d1b7a379-cd3b-4721-aba9-a17c7ef7befa');
    expect(envelope.data.baseType).toBe('EventData');
    expect(envelope.data.baseData.name).toBe('usage-ping');
    expect(envelope.tags['ai.application.ver']).toBe('1.11.2');
    expect(envelope.data.baseData.properties).toEqual(
      expect.objectContaining({
        machineId: expect.stringMatching(/^[0-9a-f]{64}$/),
        userId: expect.stringMatching(/^[0-9a-f]{64}$/),
        os: process.platform,
        osVersion: expect.any(String),
        kernelVersion: expect.any(String),
        arch: process.arch,
        locale: expect.any(String),
        timezone: expect.any(String),
        domain: expect.any(String),
        isFirstRun: expect.stringMatching(/^(true|false)$/),
        uptimeSec: expect.stringMatching(/^\d+$/),
        telemetrySchema: expect.stringMatching(/^\d+$/),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        hour: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
      }),
    );
    expect(envelope.data.baseData.properties.version).toBeUndefined();
    expect(mockWriteFile).toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\tmax\\.telemetry-last-ping',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
      'utf8',
    );
  });

  test('skips ping when already recorded this hour', async () => {
    const { getLocalHourString, sendUsagePing } = await import('../../../src/main/telemetry');
    mockReadFile.mockResolvedValue(`${getLocalHourString()}\n`);

    await sendUsagePing();

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test('sends again once the hour bucket changes', async () => {
    const { getLocalHourString, sendUsagePing } = await import('../../../src/main/telemetry');
    // Stored key is a previous hour, so a new ping must be sent.
    const prevHour = getLocalHourString(new Date(Date.now() - 2 * 60 * 60 * 1000));
    mockReadFile.mockResolvedValue(`${prevHour}\n`);

    await sendUsagePing();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const envelope = JSON.parse((lastRequestBody as Buffer).toString('utf8'));
    expect(envelope.data.baseData.properties.hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(mockWriteFile).toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\tmax\\.telemetry-last-ping',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
      'utf8',
    );
  });

  test('does not record the hour when the send fails (so it retries next tick)', async () => {
    // Server returns 500 => not a successful send.
    mockRequest.mockImplementation(
      (_options: unknown, cb?: (res: unknown) => void) => {
        const res = {
          statusCode: 500,
          on: (event: string, handler: () => void) => {
            if (event === 'end') queueMicrotask(handler);
            return res;
          },
        };
        if (cb) cb(res);
        return { on: () => ({}), write: () => {}, end: () => {}, destroy: () => {} };
      },
    );
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    await expect(sendUsagePing()).resolves.toBeUndefined();
    // Attempted the request, but did NOT write the dedup file (will retry).
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\tmax\\.telemetry-last-ping',
      expect.anything(),
      'utf8',
    );
  });

  test('never throws when the network request fails', async () => {
    // Simulate https.request throwing synchronously (e.g. offline / bad config).
    mockRequest.mockImplementation(() => {
      throw new Error('network down');
    });
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    // Must resolve, not reject, and must not have recorded a successful ping.
    await expect(sendUsagePing()).resolves.toBeUndefined();
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\tmax\\.telemetry-last-ping',
      expect.anything(),
      'utf8',
    );
  });

  test('skips ping when telemetry is disabled', async () => {
    mockStoreGet.mockImplementation((key: string) => key === 'telemetry.enabled' ? false : undefined);
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    await sendUsagePing();

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test('startUsagePingSchedule pings on startup and hourly, and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const { startUsagePingSchedule } = await import('../../../src/main/telemetry');
      const stop = startUsagePingSchedule(5000, 60 * 60 * 1000);

      // Nothing fires before the initial delay.
      expect(mockRequest).not.toHaveBeenCalled();

      // Initial ping after 5s.
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Next hour: the stored key is a previous hour, so it sends again.
      const { getLocalHourString } = await import('../../../src/main/telemetry');
      mockReadFile.mockResolvedValue(getLocalHourString(new Date(Date.now() - 2 * 60 * 60 * 1000)));
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      // After stop(), no further pings.
      stop();
      await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
