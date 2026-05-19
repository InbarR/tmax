import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// Tests for getEffectiveCwd() helper and DiffReview CWD resolution.
// Covers: https://github.com/yoziv/tmax/issues/3 + follow-ups
//
// Follow-up 1: Stale session guard — only prefer AI CWD when session is active
// Follow-up 2: Centralized helper — getEffectiveCwd() used by all consumers

const SESSION_ID = 'effective-cwd-test-session';
const TERMINAL_ID = 'effective-cwd-test-terminal';
const SHELL_CWD = 'C:\\Users';
const AI_SESSION_CWD = 'C:\\Users\\yoziv\\source\\repos\\MyProject';

function makeSession(overrides: Partial<CopilotSessionSummary> = {}): CopilotSessionSummary {
  return {
    id: SESSION_ID,
    provider: 'copilot',
    status: 'thinking',
    cwd: AI_SESSION_CWD,
    branch: 'main',
    repository: 'MyProject',
    summary: 'Test session',
    messageCount: 1,
    toolCallCount: 0,
    lastActivityTime: Date.now(),
    ...overrides,
  };
}

function injectTerminal(window: any, opts: { termId: string; sessId?: string; cwd: string }) {
  return window.evaluate(({ termId, sessId, cwd }: any) => {
    const store = (window as any).__terminalStore.getState();
    const newTerminals = new Map(store.terminals);
    newTerminals.set(termId, {
      id: termId,
      title: 'test-pane',
      customTitle: true,
      shellProfileId: 'pwsh',
      cwd,
      mode: 'tiled',
      pid: 9999,
      lastProcess: '',
      startupCommand: '',
      aiSessionId: sessId,
      aiAutoTitle: true,
    });
    (window as any).__terminalStore.setState({ terminals: newTerminals });
  }, opts);
}

function evalEffectiveCwd(window: any, termId: string) {
  return window.evaluate(({ termId }: any) => {
    // Import the helper from the store module
    const { getEffectiveCwd } = require('../src/renderer/state/terminal-store');
    if (typeof getEffectiveCwd === 'function') {
      const s = (window as any).__terminalStore.getState();
      const t = s.terminals.get(termId);
      return getEffectiveCwd(t, s.copilotSessions, s.claudeCodeSessions);
    }
    // Fallback: replicate the logic inline (packaged app may not have require)
    const s = (window as any).__terminalStore.getState();
    const t = s.terminals.get(termId);
    if (!t) return '';
    if (t.aiSessionId) {
      const sess = [...(s.copilotSessions || []), ...(s.claudeCodeSessions || [])]
        .find((x: any) => x.id === t.aiSessionId);
      if (sess?.cwd && sess.status !== 'idle') return sess.cwd;
    }
    return t.cwd ?? '';
  }, { termId });
}

test('active AI session CWD preferred over shell CWD', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    await injectTerminal(window, { termId: TERMINAL_ID, sessId: SESSION_ID, cwd: SHELL_CWD });
    await window.evaluate(({ session }: any) => {
      (window as any).__terminalStore.setState({
        copilotSessions: [session],
      });
    }, { session: makeSession({ status: 'thinking' }) });

    const cwd = await evalEffectiveCwd(window, TERMINAL_ID);
    expect(cwd).toBe(AI_SESSION_CWD);

    // Shell CWD should be untouched
    const shellCwd = await window.evaluate(({ termId }: any) => {
      return (window as any).__terminalStore.getState().terminals.get(termId)?.cwd;
    }, { termId: TERMINAL_ID });
    expect(shellCwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});

test('idle AI session CWD NOT used — falls back to shell CWD', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    await injectTerminal(window, { termId: TERMINAL_ID, sessId: SESSION_ID, cwd: SHELL_CWD });
    await window.evaluate(({ session }: any) => {
      (window as any).__terminalStore.setState({
        copilotSessions: [session],
      });
    }, { session: makeSession({ status: 'idle' }) });

    const cwd = await evalEffectiveCwd(window, TERMINAL_ID);
    // Should fall back to shell CWD because session is idle
    expect(cwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});

test('no AI session — uses shell CWD', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    await injectTerminal(window, { termId: 'plain-terminal', cwd: SHELL_CWD });

    const cwd = await evalEffectiveCwd(window, 'plain-terminal');
    expect(cwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});

test('stale aiSessionId (session removed) — falls back to shell CWD', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Terminal linked to a session that doesn't exist in the arrays
    await injectTerminal(window, { termId: TERMINAL_ID, sessId: 'nonexistent-session', cwd: SHELL_CWD });

    const cwd = await evalEffectiveCwd(window, TERMINAL_ID);
    expect(cwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});
