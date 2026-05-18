import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// Regression test for https://github.com/yoziv/tmax/issues/3
//
// When the Copilot CLI changes directory internally (via `cwd` command),
// the diff panel failed with "No git repository found from: C:\Users"
// because it read terminal.cwd (shell CWD) which stays stale.
//
// Fix: DiffReview.tsx's terminalCwd selector now checks the linked AI
// session's CWD first, falling back to terminal.cwd when no session is
// linked. This avoids overwriting terminal.cwd (no two-writers problem).

const SESSION_ID = 'diff-cwd-test-session';
const TERMINAL_ID = 'diff-cwd-test-terminal';
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

test('terminalCwd selector prefers AI session CWD over shell CWD', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Inject a terminal linked to a session, with a stale shell CWD
    await window.evaluate(({ termId, sessId, cwd, session }) => {
      const store = (window as any).__terminalStore.getState();
      // Add the terminal
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
      // Add the copilot session
      (window as any).__terminalStore.setState({
        terminals: newTerminals,
        copilotSessions: [session],
      });
    }, { termId: TERMINAL_ID, sessId: SESSION_ID, cwd: SHELL_CWD, session: makeSession() });

    // Simulate opening diff review for this terminal
    await window.evaluate(({ termId }) => {
      (window as any).__terminalStore.setState({
        diffReviewOpen: true,
        diffReviewTerminalId: termId,
      });
    }, { termId: TERMINAL_ID });

    // Read the effective CWD that the diff panel would use
    // This mirrors DiffReview.tsx's terminalCwd selector
    const effectiveCwd = await window.evaluate(({ termId }) => {
      const s = (window as any).__terminalStore.getState();
      const t = s.terminals.get(termId);
      if (!t) return '';
      if (t.aiSessionId) {
        const sess = s.copilotSessions.find((x: any) => x.id === t.aiSessionId)
                  ?? s.claudeCodeSessions?.find((x: any) => x.id === t.aiSessionId);
        if (sess?.cwd) return sess.cwd;
      }
      return t.cwd ?? '';
    }, { termId: TERMINAL_ID });

    // Should return the AI session's CWD, not the shell's stale CWD
    expect(effectiveCwd).toBe(AI_SESSION_CWD);

    // terminal.cwd should remain untouched (shell CWD preserved)
    const shellCwd = await window.evaluate(({ termId }) => {
      return (window as any).__terminalStore.getState().terminals.get(termId)?.cwd;
    }, { termId: TERMINAL_ID });
    expect(shellCwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});

test('terminalCwd selector falls back to shell CWD when no AI session', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Inject a terminal with NO linked AI session
    await window.evaluate(({ termId, cwd }) => {
      const store = (window as any).__terminalStore.getState();
      const newTerminals = new Map(store.terminals);
      newTerminals.set(termId, {
        id: termId,
        title: 'plain-shell',
        customTitle: false,
        shellProfileId: 'pwsh',
        cwd,
        mode: 'tiled',
        pid: 9998,
        lastProcess: '',
        startupCommand: '',
        // No aiSessionId
      });
      (window as any).__terminalStore.setState({ terminals: newTerminals });
    }, { termId: 'no-ai-terminal', cwd: SHELL_CWD });

    // Read the effective CWD — should be the shell CWD
    const effectiveCwd = await window.evaluate(({ termId }) => {
      const s = (window as any).__terminalStore.getState();
      const t = s.terminals.get(termId);
      if (!t) return '';
      if (t.aiSessionId) {
        const sess = s.copilotSessions.find((x: any) => x.id === t.aiSessionId)
                  ?? s.claudeCodeSessions?.find((x: any) => x.id === t.aiSessionId);
        if (sess?.cwd) return sess.cwd;
      }
      return t.cwd ?? '';
    }, { termId: 'no-ai-terminal' });

    expect(effectiveCwd).toBe(SHELL_CWD);
  } finally {
    await close();
  }
});
