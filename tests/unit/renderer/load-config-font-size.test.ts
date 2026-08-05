// loadConfig must seed the store's live zoom size from terminal.fontSize.
//
// Without it the store kept its hardcoded initial 14 while the status-bar
// badge divided by the configured baseline, so a configured 17.5 rendered at
// 14px and showed 80%. terminal-store reads window at module load, so the
// stubs go in before a dynamic import (test env is 'node').
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const getConfigResult: { value: unknown } = { value: {} };

(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.terminalAPI = {
  getConfig: async () => getConfigResult.value,
};
(globalThis as any).document = (globalThis as any).document ?? {
  hasFocus: () => true,
  documentElement: { style: { setProperty: () => {} } },
};

let useTerminalStore: typeof import('../../../src/renderer/state/terminal-store').useTerminalStore;

beforeAll(async () => {
  ({ useTerminalStore } = await import('../../../src/renderer/state/terminal-store'));
});

beforeEach(() => {
  // The hardcoded initial state, so each case starts from the pre-load value.
  useTerminalStore.setState({ fontSize: 14 });
});

describe('loadConfig - terminal font size', () => {
  test('seeds fontSize from the configured baseline', async () => {
    getConfigResult.value = { terminal: { fontSize: 17.5 } };

    await useTerminalStore.getState().loadConfig();

    expect(useTerminalStore.getState().fontSize).toBe(17.5);
  });

  test('a configured baseline equal to the default is still applied', async () => {
    getConfigResult.value = { terminal: { fontSize: 14 } };

    await useTerminalStore.getState().loadConfig();

    expect(useTerminalStore.getState().fontSize).toBe(14);
  });

  test('keeps the default when config carries no terminal section', async () => {
    getConfigResult.value = {};

    await useTerminalStore.getState().loadConfig();

    expect(useTerminalStore.getState().fontSize).toBe(14);
  });

  test('ignores a non-numeric font size', async () => {
    getConfigResult.value = { terminal: { fontSize: '18' } };

    await useTerminalStore.getState().loadConfig();

    expect(useTerminalStore.getState().fontSize).toBe(14);
  });

  test('ignores a zero or negative font size', async () => {
    getConfigResult.value = { terminal: { fontSize: 0 } };
    await useTerminalStore.getState().loadConfig();
    expect(useTerminalStore.getState().fontSize).toBe(14);

    getConfigResult.value = { terminal: { fontSize: -4 } };
    await useTerminalStore.getState().loadConfig();
    expect(useTerminalStore.getState().fontSize).toBe(14);
  });

  test('config itself is still stored alongside the seeded size', async () => {
    getConfigResult.value = { terminal: { fontSize: 20 }, defaultShellId: 'zsh' };

    await useTerminalStore.getState().loadConfig();

    expect(useTerminalStore.getState().fontSize).toBe(20);
    expect(useTerminalStore.getState().config?.terminal?.fontSize).toBe(20);
  });
});
