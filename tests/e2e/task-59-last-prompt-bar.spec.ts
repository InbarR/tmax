import { test, expect, Page } from '@playwright/test';
import { launchTmax, getStoreState } from './fixtures/launch';

// TASK-59 regression: the last-prompt bar at the bottom of an AI pane was
// showing a stale prompt and never updating to the latest user input. The
// bar text comes from `claudeCodeSessions[i].latestPrompt` (or copilot)
// looked up by the pane's `aiSessionId`. The store is updated on every IPC
// 'session-updated' event from the main process - which means each new user
// prompt should bump the visible text.
//
// This spec exercises the renderer chain end-to-end without needing a real
// Claude Code or Copilot CLI process: we inject a fake session into the
// store, then call the same store action the IPC handler would call when a
// fresh prompt event arrives. If the bar fails to refresh, it stays on the
// initial prompt and this test fails.

const SESSION_ID = 'task-59-stale-prompt-session';
const FIRST_PROMPT = 'first prompt - should be replaced';
const SECOND_PROMPT = 'second prompt - latest user input';
const THIRD_PROMPT = 'third prompt after another turn';

async function injectFakeSession(window: Page, terminalId: string, prompt: string): Promise<void> {
  await window.evaluate(({ id, sessionId, p }) => {
    const store = (window as any).__terminalStore;
    const s = store.getState();
    const terminals = new Map(s.terminals);
    const tInst = terminals.get(id);
    if (!tInst) throw new Error('terminal not in store');
    terminals.set(id, { ...tInst, aiSessionId: sessionId });
    store.setState({
      terminals,
      claudeCodeSessions: [{
        id: sessionId,
        provider: 'claude-code',
        status: 'thinking',
        cwd: '',
        branch: '',
        repository: '',
        summary: 'TASK-59 stale-prompt regression',
        latestPrompt: p,
        latestPromptTime: Date.now(),
        messageCount: 1,
        toolCallCount: 0,
        lastActivityTime: Date.now(),
      }],
    });
  }, { id: terminalId, sessionId: SESSION_ID, p: prompt });
}

async function pushSessionUpdate(window: Page, prompt: string, messageCount: number): Promise<void> {
  await window.evaluate(({ sessionId, p, count }) => {
    const store = (window as any).__terminalStore;
    // Use the same store action that the IPC handler uses on session-updated.
    // This is what the production update path runs - if it fails to propagate
    // to the renderer, we'll see a stale bar in the next assertion.
    store.getState().updateClaudeCodeSession({
      id: sessionId,
      provider: 'claude-code',
      status: 'thinking',
      cwd: '',
      branch: '',
      repository: '',
      summary: 'TASK-59 stale-prompt regression',
      latestPrompt: p,
      latestPromptTime: Date.now(),
      messageCount: count,
      toolCallCount: 0,
      lastActivityTime: Date.now(),
    });
  }, { sessionId: SESSION_ID, p: prompt, count: messageCount });
}

test('last-prompt bar updates when a new user prompt arrives in the linked session', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    await injectFakeSession(window, terminalId, FIRST_PROMPT);
    await window.waitForSelector('.terminal-pane-latest-prompt', { timeout: 5_000 });

    // Bar starts on the first prompt.
    const barText = window.locator('.terminal-pane-latest-prompt-text');
    await expect(barText).toHaveText(FIRST_PROMPT);

    // Simulate a session-updated IPC event with a brand new latest prompt.
    await pushSessionUpdate(window, SECOND_PROMPT, 2);
    await expect(barText).toHaveText(SECOND_PROMPT, { timeout: 3_000 });

    // And once more, to make sure it's not a single fluke.
    await pushSessionUpdate(window, THIRD_PROMPT, 3);
    await expect(barText).toHaveText(THIRD_PROMPT, { timeout: 3_000 });
  } finally {
    await close();
  }
});

test('updateClaudeCodeSession upserts when the session-added event lost the race', async () => {
  // The real-world bug behind TASK-59: the renderer subscribes to
  // session-updated IPC events in one effect and calls loadClaudeCodeSessions
  // in another. If a brand-new prompt arrives while loadClaudeCodeSessions
  // is still in flight, onSessionUpdated runs against an empty
  // claudeCodeSessions array. A plain `.map` drops the update silently and
  // the bar stays on whatever the load eventually returns - the stale text
  // the user reported. The fix is to upsert in updateClaudeCodeSession /
  // updateCopilotSession so the latest data always lands in the store.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    // Pre-link the pane to a session id but leave claudeCodeSessions empty,
    // simulating the load-not-yet-arrived window.
    await window.evaluate(({ id, sessionId }) => {
      const store = (window as any).__terminalStore;
      const s = store.getState();
      const terminals = new Map(s.terminals);
      const tInst = terminals.get(id);
      if (!tInst) throw new Error('terminal not in store');
      terminals.set(id, { ...tInst, aiSessionId: sessionId });
      store.setState({ terminals, claudeCodeSessions: [] });
    }, { id: terminalId, sessionId: SESSION_ID });

    // Fire updateClaudeCodeSession with no prior add - the IPC ordering bug.
    await window.evaluate(({ sessionId, prompt }) => {
      (window as any).__terminalStore.getState().updateClaudeCodeSession({
        id: sessionId,
        provider: 'claude-code',
        status: 'thinking',
        cwd: '',
        branch: '',
        repository: '',
        summary: 'TASK-59 race: update-before-add',
        latestPrompt: prompt,
        latestPromptTime: Date.now(),
        messageCount: 1,
        toolCallCount: 0,
        lastActivityTime: Date.now(),
      });
    }, { sessionId: SESSION_ID, prompt: SECOND_PROMPT });

    // The bar should appear with the prompt that arrived in the update.
    await window.waitForSelector('.terminal-pane-latest-prompt', { timeout: 5_000 });
    const barText = window.locator('.terminal-pane-latest-prompt-text');
    await expect(barText).toHaveText(SECOND_PROMPT);
  } finally {
    await close();
  }
});

test('updateCopilotSession upserts when the session-added event lost the race', async () => {
  // Same race as the Claude variant above - copilot has its own pair of
  // store actions and the same .map-drops-update bug fix has to apply
  // there too. We pin both providers because the IPC paths are independent.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];
    const copilotSessionId = 'task-59-copilot-race-session';

    await window.evaluate(({ id, sessionId }) => {
      const store = (window as any).__terminalStore;
      const s = store.getState();
      const terminals = new Map(s.terminals);
      const tInst = terminals.get(id);
      if (!tInst) throw new Error('terminal not in store');
      terminals.set(id, { ...tInst, aiSessionId: sessionId });
      store.setState({ terminals, copilotSessions: [], claudeCodeSessions: [] });
    }, { id: terminalId, sessionId: copilotSessionId });

    await window.evaluate(({ sessionId, prompt }) => {
      (window as any).__terminalStore.getState().updateCopilotSession({
        id: sessionId,
        provider: 'copilot',
        status: 'thinking',
        cwd: '',
        branch: '',
        repository: '',
        summary: 'TASK-59 race: update-before-add (copilot)',
        latestPrompt: prompt,
        latestPromptTime: Date.now(),
        messageCount: 1,
        toolCallCount: 0,
        lastActivityTime: Date.now(),
      });
    }, { sessionId: copilotSessionId, prompt: SECOND_PROMPT });

    await window.waitForSelector('.terminal-pane-latest-prompt', { timeout: 5_000 });
    const barText = window.locator('.terminal-pane-latest-prompt-text');
    await expect(barText).toHaveText(SECOND_PROMPT);
  } finally {
    await close();
  }
});

test('last-prompt bar tooltip and jump-target text both update on each new prompt', async () => {
  // The bar surfaces the prompt in three places: the visible span, the
  // hover tooltip (`title` attribute), and the click handler that searches
  // for the prompt in the buffer. They all read from the same store value,
  // but each one is wired separately - if a memo or stale closure breaks
  // any of them, the regression we're pinning would still manifest.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const state = await getStoreState(window);
    const terminalId = state.terminalIds[0];

    await injectFakeSession(window, terminalId, FIRST_PROMPT);
    await window.waitForSelector('.terminal-pane-latest-prompt', { timeout: 5_000 });

    const bar = window.locator('.terminal-pane-latest-prompt');
    const barText = window.locator('.terminal-pane-latest-prompt-text');

    await expect(barText).toHaveText(FIRST_PROMPT);
    const initialTitle = await bar.getAttribute('title');
    expect(initialTitle).toContain(FIRST_PROMPT);

    await pushSessionUpdate(window, SECOND_PROMPT, 2);
    await expect(barText).toHaveText(SECOND_PROMPT, { timeout: 3_000 });

    const updatedTitle = await bar.getAttribute('title');
    expect(updatedTitle).toContain(SECOND_PROMPT);
    expect(updatedTitle).not.toContain(FIRST_PROMPT);
  } finally {
    await close();
  }
});
