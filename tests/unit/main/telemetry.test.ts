import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockStoreGet = vi.fn();
const mockGetPath = vi.fn();
const mockGetVersion = vi.fn();
const mockHostname = vi.fn();
const mockUserInfo = vi.fn();
const mockTrackEvent = vi.fn();
const mockFlush = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
    getVersion: mockGetVersion,
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
  },
}));

vi.mock('node:os', () => ({
  default: {
    hostname: mockHostname,
    userInfo: mockUserInfo,
  },
}));

vi.mock('applicationinsights', () => ({
  TelemetryClient: class MockTelemetryClient {
    config = { disableAppInsights: false, noDiagnosticChannel: false };
    constructor() {}
    trackEvent = mockTrackEvent;
    flush = mockFlush;
  },
}));

describe('telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockGetPath.mockReturnValue('C:\\Users\\me\\AppData\\Roaming\\tmax');
    mockGetVersion.mockReturnValue('1.11.2');
    mockStoreGet.mockReturnValue(undefined);
    mockHostname.mockReturnValue('test-host');
    mockUserInfo.mockReturnValue({ username: 'test-user' });
    mockReadFile.mockRejectedValue(new Error('missing'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFlush.mockResolvedValue(undefined);
  });

  test('creates a stable anonymous machine id', async () => {
    const { createAnonymousMachineId } = await import('../../../src/main/telemetry');

    expect(createAnonymousMachineId('host', 'user')).toBe('8d0ac992bcd4ae14');
    expect(createAnonymousMachineId('host', 'user')).toMatch(/^[0-9a-f]{16}$/);
  });

  test('sends a ping via App Insights and records the day', async () => {
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    await sendUsagePing();

    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: 'usage-ping',
      properties: expect.objectContaining({
        machineId: expect.stringMatching(/^[0-9a-f]{16}$/),
        version: '1.11.2',
        os: process.platform,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    });
    expect(mockFlush).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\tmax\\.telemetry-last-ping',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'utf8',
    );
  });

  test('skips ping when already recorded today', async () => {
    const { getLocalDateString, sendUsagePing } = await import('../../../src/main/telemetry');
    mockReadFile.mockResolvedValue(`${getLocalDateString()}\n`);

    await sendUsagePing();

    expect(mockTrackEvent).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test('skips ping when telemetry is disabled', async () => {
    mockStoreGet.mockImplementation((key: string) => key === 'telemetry.enabled' ? false : undefined);
    const { sendUsagePing } = await import('../../../src/main/telemetry');

    await sendUsagePing();

    expect(mockTrackEvent).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
