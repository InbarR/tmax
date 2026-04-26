import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Repros "Show prompts from pane menu does nothing." Pane menu's "💬 Show
// prompts" item calls store.showPromptsForTerminal(id), which sets
// `promptsDialogRequest: { terminalId }`. CopilotPanel's effect then
// resolves the session and pops the prompts dialog. We click through the
// real menu and assert the dialog shows.

test('clicking "Show prompts" in the pane ⋯ menu opens the prompts dialog', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const terminalId = await window.evaluate(() =>
      Array.from((window as any).__terminalStore.getState().terminals.keys())[0]
    );

    // Inject a fake claude-code session for this terminal AND an API mock so
    // the prompts list loads (the real getClaudeCodePrompts hits disk).
    await window.evaluate(({ id, prompt }) => {
      const store = (window as any).__terminalStore;
      const s = store.getState();
      const terminals = new Map(s.terminals);
      const tInst = terminals.get(id);
      terminals.set(id, { ...tInst, aiSessionId: 'show-prompts-test-session' });
      store.setState({
        terminals,
        claudeCodeSessions: [{
          id: 'show-prompts-test-session',
          provider: 'claude-code',
          status: 'idle',
          cwd: '', branch: '', repository: '', summary: 'Show-prompts test',
          latestPrompt: prompt, latestPromptTime: Date.now(),
          messageCount: 1, toolCallCount: 0, lastActivityTime: Date.now(),
        }],
      });
      // contextBridge-exposed objects are read-only - so `api.getX = ...`
      // throws. Patch the function via Object.defineProperty after copying
      // the descriptor as writable. If that still doesn't work, fall back
      // to overriding window.terminalAPI itself.
      try {
        const api = (window as any).terminalAPI;
        Object.defineProperty(api, 'getClaudeCodePrompts', {
          value: async () => ['fake prompt 1', 'fake prompt 2'],
          configurable: true, writable: true,
        });
      } catch {
        const origApi = (window as any).terminalAPI;
        (window as any).terminalAPI = new Proxy(origApi, {
          get(target, p, recv) {
            if (p === 'getClaudeCodePrompts') return async () => ['fake prompt 1', 'fake prompt 2'];
            return Reflect.get(target, p, recv);
          },
        });
      }
    }, { id: terminalId, prompt: 'a remembered prompt' });

    await window.click('.terminal-pane-menu-btn');
    await window.waitForSelector('.context-menu', { timeout: 3_000 });

    // The Show prompts button only renders when aiSessionId is set on the
    // panel, which our injection ensures. Find it by visible text.
    const btn = window.locator('.context-menu-item', { hasText: 'Show prompts' });
    await expect(btn).toBeVisible({ timeout: 2_000 });
    await btn.click();

    // The dialog must appear.
    await window.waitForSelector('.ai-prompts-dialog', { timeout: 3_000 });
    const items = await window.$$('.ai-prompt-item');
    console.log('prompt items:', items.length);
    expect(items.length).toBeGreaterThanOrEqual(1);
  } finally {
    await close();
  }
});
