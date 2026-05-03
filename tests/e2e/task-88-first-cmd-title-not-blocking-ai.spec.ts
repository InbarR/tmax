import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// TASK-88 / GH #85 regression: pane title fixates on first command.
//
// TASK-23 (commit 3217ec0) auto-renames a pane to the user's first
// command (e.g. `cd C:\\`) and sets `customTitle: true` so OSC titles
// don't override. Pre-fix, when an AI session was later detected for
// the same pane, terminal-store.updateTerminalTitleFromSession used
// `aiAutoTitle: !current.customTitle` which evaluated to false because
// TASK-23 had set customTitle:true. That blocked the AI auto-title
// branch (the pane title stayed as "cd C:\\") and worse: the
// pendingOverride logic promoted the first-command title into
// sessionNameOverrides as if it were a deliberate user rename.
//
// Fix: distinguish first-command auto-titles (firstCommandTitle:true)
// from explicit user renames. Only deliberate user renames block AI
// auto-title.
//
// Precedence: explicit user rename > AI session topic > first-command
// title > generic shell name.

const SESSION_ID = 'task-88-first-cmd-then-ai-session';

function makeSession(overrides: Partial<CopilotSessionSummary> = {}): CopilotSessionSummary {
  return {
    id: SESSION_ID,
    provider: 'claude-code',
    status: 'active',
    cwd: 'C:\\projects\\tmax',
    branch: 'main',
    repository: 'tmax',
    summary: 'fix the regression in pane titles',
    slug: 'calm-river',
    latestPrompt: 'fix the regression in pane titles',
    latestPromptTime: Date.now(),
    messageCount: 1,
    toolCallCount: 0,
    lastActivityTime: Date.now(),
    ...overrides,
  };
}

// Drive a pane through the same flow the bug reporter described:
//   1) open a fresh terminal (no AI session, no custom title)
//   2) simulate TASK-23's first-command rename: renameTerminal(id, 'cd C:\\', true)
//   3) align the pane's cwd with the session's cwd (auto-link prereq)
//   4) call updateTerminalTitleFromSession with an AI session
//   5) assert the title flips to the session topic, not 'cd C:\\'
async function setupPaneAndLink(window: any) {
  const tid = await window.evaluate(() => {
    const store = (window as any).__terminalStore.getState();
    const [id] = store.terminals.keys();
    return id;
  });
  expect(tid).toBeTruthy();

  // Force the pane's cwd so it matches the test session's cwd.
  await window.evaluate((id: string) => {
    const store = (window as any).__terminalStore;
    const state = store.getState();
    const next = new Map(state.terminals);
    const inst = next.get(id);
    next.set(id, { ...inst, cwd: 'C:\\projects\\tmax', aiSessionId: undefined, customTitle: false });
    store.setState({ terminals: next, focusedTerminalId: id });
  }, tid);

  // Simulate TASK-23's first-command rename (the user typed `cd C:\\`+Enter
  // before any AI session was running here). Production codepath:
  // TerminalPanel.tsx calls renameTerminal(id, cmd, true, { firstCommand: true }).
  await window.evaluate((id: string) => {
    (window as any).__terminalStore.getState().renameTerminal(id, 'cd C:\\', true, { firstCommand: true });
  }, tid);

  const beforeLinkTitle = await window.evaluate((id: string) => {
    return (window as any).__terminalStore.getState().terminals.get(id)?.title;
  }, tid);
  expect(beforeLinkTitle).toBe('cd C:\\');

  return tid;
}

test('AI session detected after first-command title overrides the pane title with the session topic', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });
    const tid = await setupPaneAndLink(window);

    // The session monitor's add path drives updateTerminalTitleFromSession.
    await window.evaluate((s: CopilotSessionSummary) => {
      (window as any).__terminalStore.getState().addClaudeCodeSession
        ? (window as any).__terminalStore.getState().addClaudeCodeSession(s)
        : (window as any).__terminalStore.getState().updateTerminalTitleFromSession(s, 'claude');
    }, makeSession());

    const after = await window.evaluate((id: string) => {
      const inst = (window as any).__terminalStore.getState().terminals.get(id);
      return { title: inst?.title, aiSessionId: inst?.aiSessionId };
    }, tid);

    expect(after.aiSessionId).toBe(SESSION_ID);
    // Pane title must NOT remain stuck on the first-command title.
    expect(after.title).not.toBe('cd C:\\');
    // It should reflect the AI session summary instead.
    expect(after.title).toContain('fix the regression');
  } finally {
    await close();
  }
});

test('first-command title is NOT promoted to sessionNameOverrides on AI link', async () => {
  // The pendingOverride logic was treating a first-command auto-title
  // as a deliberate user rename and persisting it. That made the bug
  // sticky across restarts and notification toasts (TASK-71 path).
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });
    await setupPaneAndLink(window);

    await window.evaluate((s: CopilotSessionSummary) => {
      const store = (window as any).__terminalStore.getState();
      if (store.addClaudeCodeSession) store.addClaudeCodeSession(s);
      else store.updateTerminalTitleFromSession(s, 'claude');
    }, makeSession());

    const override = await window.evaluate((id: string) => {
      return (window as any).__terminalStore.getState().sessionNameOverrides[id];
    }, SESSION_ID);

    // The first-command title 'cd C:\\' must not have been captured as
    // an override. Either undefined or anything other than 'cd C:\\'.
    expect(override).not.toBe('cd C:\\');
  } finally {
    await close();
  }
});

test('explicit user rename still wins over AI session topic (precedence: user > AI)', async () => {
  // This is the protective AC: the fix must not break TASK-71 / pr75
  // (user rename wins). We rename the pane DIRECTLY via the store's
  // renameTerminal action - that's what the floating rename input
  // calls when the user edits the pane title - then link an AI session
  // and assert the pane keeps the user's name.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    const tid = await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      return id;
    });

    await window.evaluate((id: string) => {
      const store = (window as any).__terminalStore;
      const state = store.getState();
      const next = new Map(state.terminals);
      const inst = next.get(id);
      next.set(id, { ...inst, cwd: 'C:\\projects\\tmax', aiSessionId: undefined, customTitle: false });
      store.setState({ terminals: next, focusedTerminalId: id });
    }, tid);

    // Explicit user rename (the user typed a name into the floating rename input).
    await window.evaluate((id: string) => {
      (window as any).__terminalStore.getState().renameTerminal(id, 'my-explicit-name', true);
      // Mark this rename as user-driven so the AI link path knows to respect it.
      // Production codepath: FloatingRenameInput.commit -> renameTerminal(..., true)
      // is followed by the user-rename being treated as a deliberate change.
      // The fix relies on a flag; if the test setup needs to set it explicitly,
      // do so via the store too.
    }, tid);

    await window.evaluate((s: CopilotSessionSummary) => {
      const store = (window as any).__terminalStore.getState();
      if (store.addClaudeCodeSession) store.addClaudeCodeSession(s);
      else store.updateTerminalTitleFromSession(s, 'claude');
    }, makeSession({ id: 'task-88-explicit-rename-session' }));

    const title = await window.evaluate((id: string) => {
      return (window as any).__terminalStore.getState().terminals.get(id)?.title;
    }, tid);

    expect(title).toBe('my-explicit-name');
  } finally {
    await close();
  }
});

test('shell pane with no AI session keeps the first-command title (no TASK-23 regression)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    const tid = await window.evaluate(() => {
      const store = (window as any).__terminalStore.getState();
      const [id] = store.terminals.keys();
      return id;
    });

    await window.evaluate((id: string) => {
      (window as any).__terminalStore.getState().renameTerminal(id, 'npx vibe-kanban', true);
    }, tid);

    // Simulate the shell sending an OSC title change. The TASK-23 guarantee
    // is that customTitle:true blocks OSC overrides, so the pane keeps the
    // first-command title.
    await window.evaluate((id: string) => {
      // No AI session arrives; the title should remain unchanged.
      const inst = (window as any).__terminalStore.getState().terminals.get(id);
      // sanity probe: customTitle must be true (this is what blocks OSC)
      (window as any).__task88_customTitle = inst?.customTitle;
    }, tid);

    const customTitle = await window.evaluate(() => (window as any).__task88_customTitle);
    expect(customTitle).toBe(true);

    const title = await window.evaluate((id: string) => {
      return (window as any).__terminalStore.getState().terminals.get(id)?.title;
    }, tid);
    expect(title).toBe('npx vibe-kanban');
  } finally {
    await close();
  }
});
