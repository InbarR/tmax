import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Regression test for PR #75 — pane title respects session rename.
// When a user renames a session via setSessionNameOverride, all linked
// terminal pane titles must update to the new name.

test('PR #75: session rename propagates to linked pane title', async () => {
  const { window, close } = await launchTmax();
  try {
    // Wait for the first terminal to be ready
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    // Get the first terminal ID and link a fake AI session to it
    const terminalId = await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      return id;
    });
    expect(terminalId).toBeTruthy();

    const fakeSessionId = 'test-session-rename-75';

    // Link the terminal to a fake AI session
    await window.evaluate(({ tid, sid }) => {
      const store = (window as any).__terminalStore;
      const state = store.getState();
      const terminals = new Map(state.terminals);
      const inst = terminals.get(tid)!;
      terminals.set(tid, { ...inst, aiSessionId: sid, customTitle: true, aiAutoTitle: false });
      store.setState({ terminals });
    }, { tid: terminalId, sid: fakeSessionId });

    // Rename the session
    await window.evaluate((sid) => {
      (window as any).__terminalStore.getState().setSessionNameOverride(sid, 'Renamed Session');
    }, fakeSessionId);

    // Verify the terminal title updated
    const title = await window.evaluate(({ tid }) => {
      return (window as any).__terminalStore.getState().terminals.get(tid)?.title;
    }, { tid: terminalId });

    expect(title).toBe('Renamed Session');
  } finally {
    await close();
  }
});

test('PR #75: session rename sets customTitle=true and aiAutoTitle=false', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    const terminalId = await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      return id;
    });

    const fakeSessionId = 'test-session-rename-flags-75';

    // Link terminal with aiAutoTitle=true
    await window.evaluate(({ tid, sid }) => {
      const store = (window as any).__terminalStore;
      const state = store.getState();
      const terminals = new Map(state.terminals);
      const inst = terminals.get(tid)!;
      terminals.set(tid, { ...inst, aiSessionId: sid, customTitle: false, aiAutoTitle: true });
      store.setState({ terminals });
    }, { tid: terminalId, sid: fakeSessionId });

    // Rename
    await window.evaluate((sid) => {
      (window as any).__terminalStore.getState().setSessionNameOverride(sid, 'Custom Name');
    }, fakeSessionId);

    // Verify flags
    const flags = await window.evaluate(({ tid }) => {
      const inst = (window as any).__terminalStore.getState().terminals.get(tid);
      return { customTitle: inst?.customTitle, aiAutoTitle: inst?.aiAutoTitle };
    }, { tid: terminalId });

    expect(flags.customTitle).toBe(true);
    expect(flags.aiAutoTitle).toBe(false);
  } finally {
    await close();
  }
});
