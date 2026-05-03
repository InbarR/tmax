import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// TASK-71 regression: when a user renames an AI session pane via the UI,
// the rename is stored in renderer-only `sessionNameOverrides[sessionId]`
// state. Pre-fix, OS notifications surfaced session.summary (firstPrompt
// or cwdFolder) instead of the user's chosen name because main process
// could not see renderer-only state.
//
// Fix: terminal-store.setSessionNameOverride and restoreSession push the
// updated map to main via SESSION_NAME_OVERRIDES_SYNC; main caches it and
// notifyCopilotSession looks up overrides[id] before falling back to
// summary. Main also seeds the cache from tmax-session.json on startup.
//
// These tests use the TMAX_E2E capture array (`global.__capturedNotifications`)
// that copilot-notification.ts populates inside notifyCopilotSession when the
// E2E env flag is set, then drive the renderer to trigger notifications via
// the test-only `__notifyCopilotSession` global hook on main.

const SESSION_ID = 'task-71-rename-override-session';
const FIRST_PROMPT = 'first prompt that becomes session.summary';
const RENAMED = 'MY-CUSTOM-PANE-NAME';

async function readCapturedNotifications(app: any): Promise<{ title: string; body: string }[]> {
  return app.evaluate(() => (global as any).__capturedNotifications as { title: string; body: string }[] || []);
}

async function clearCapturedNotifications(app: any): Promise<void> {
  await app.evaluate(() => { (global as any).__capturedNotifications = []; });
}

// Drive a fake claude-code session into the "needs attention" state by
// invoking the same notify path the production monitor uses. main.ts
// hangs notifyCopilotSession on `global.__notifyCopilotSession` under
// TMAX_E2E=1 so we can call it without spinning up the real session
// monitor and writing a fake JSONL file.
async function triggerNotificationViaMain(app: any, session: CopilotSessionSummary): Promise<void> {
  await app.evaluate((_arg: unknown, s: CopilotSessionSummary) => {
    // The notify module has its own status-transition gate: it only
    // fires on the transition INTO awaitingApproval / waitingForUser.
    // Force a clean slate by clearing cooldowns first.
    const clear = (global as any).__clearNotificationCooldowns;
    if (typeof clear === 'function') clear();
    const fn = (global as any).__notifyCopilotSession;
    if (typeof fn !== 'function') throw new Error('__notifyCopilotSession not exposed - is TMAX_E2E set?');
    fn(s);
  }, session);
}

function makeSession(overrides: Partial<CopilotSessionSummary> = {}): CopilotSessionSummary {
  return {
    id: SESSION_ID,
    provider: 'claude-code',
    status: 'waitingForUser',
    cwd: 'C:/projects/tmax',
    branch: 'main',
    repository: 'tmax',
    summary: FIRST_PROMPT,
    slug: 'calm-river',
    latestPrompt: FIRST_PROMPT,
    latestPromptTime: Date.now(),
    messageCount: 1,
    toolCallCount: 0,
    lastActivityTime: Date.now(),
    ...overrides,
  };
}

test('renaming a pane updates the next notification body line 1 to the override', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Pre-fix baseline: with no override, line 1 uses session.summary.
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession());
    let captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    expect(captured[0].body.split('\n')[0]).toContain(FIRST_PROMPT);
    expect(captured[0].body).not.toContain(RENAMED);

    // Apply a user rename via the same store action the UI uses. This
    // fires the IPC sync to main.
    await window.evaluate(({ sessionId, name }) => {
      (window as any).__terminalStore.getState().setSessionNameOverride(sessionId, name);
    }, { sessionId: SESSION_ID, name: RENAMED });

    // Give the IPC send a tick to round-trip.
    await window.waitForTimeout(100);

    // Now trigger another notification - line 1 must show the override.
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession());
    captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    const line1 = captured[0].body.split('\n')[0];
    expect(line1).toContain(RENAMED);
    // The override beats the firstPrompt summary even when summary is set.
    expect(line1).not.toContain(FIRST_PROMPT);
  } finally {
    await close();
  }
});

test('un-renamed sessions continue to use session.summary (no regression)', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Different sessionId so the override map stays empty for this one.
    const otherId = 'task-71-control-session';
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession({ id: otherId }));
    const captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    expect(captured[0].body.split('\n')[0]).toContain(FIRST_PROMPT);
  } finally {
    await close();
  }
});

test('override map seeded from tmax-session.json on startup (before renderer syncs)', async () => {
  const { app, close } = await launchTmax({
    preSeed: (userDataDir) => {
      // Pre-write a session file with a rename override for SESSION_ID.
      // Main should pick this up in seedSessionNameOverridesFromDisk
      // before the renderer has a chance to sync.
      const sessionFile = join(userDataDir, 'tmax-session.json');
      const data = {
        session: {
          sessionNameOverrides: { [SESSION_ID]: RENAMED },
        },
      };
      writeFileSync(sessionFile, JSON.stringify(data));
    },
  });
  try {
    // Don't touch the renderer at all - we want to assert that main's
    // notification path picks up the disk-seeded override directly.
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession());
    const captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    const line1 = captured[0].body.split('\n')[0];
    expect(line1).toContain(RENAMED);
  } finally {
    await close();
  }
});
