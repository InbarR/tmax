import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// Regression: ClawPilot continuation turns send a "Here is the
// conversation:\nuser: ...\nassistant: ..." wrapper instead of the
// "[Clawpilot context: ...]" marker the original detector required. Once
// the marker is sliced out (latestPrompt is truncated to 120 chars) or
// never appended (continuation turns), detectSessionHost returned null
// and the notification surfaced as plain "Copilot - Waiting for Input"
// with the Copilot icon. Fix: also accept a /clawpilot/ folder segment
// in cwd as a ClawPilot fingerprint, since ClawPilot always launches in
// its own folder.

async function readCapturedNotifications(app: any): Promise<{ title: string; body: string }[]> {
  return app.evaluate(() => (global as any).__capturedNotifications as { title: string; body: string }[] || []);
}

async function clearCapturedNotifications(app: any): Promise<void> {
  await app.evaluate(() => { (global as any).__capturedNotifications = []; });
}

async function triggerNotificationViaMain(app: any, session: CopilotSessionSummary): Promise<void> {
  await app.evaluate((_arg: unknown, s: CopilotSessionSummary) => {
    const clear = (global as any).__clearNotificationCooldowns;
    if (typeof clear === 'function') clear();
    const fn = (global as any).__notifyCopilotSession;
    if (typeof fn !== 'function') throw new Error('__notifyCopilotSession not exposed - is TMAX_E2E set?');
    fn(s);
  }, session);
}

function makeSession(overrides: Partial<CopilotSessionSummary> = {}): CopilotSessionSummary {
  return {
    id: 'clawpilot-cwd-detection-session',
    provider: 'copilot',
    status: 'waitingForUser',
    cwd: 'C:/Users/me/OneDrive/Documents/Clawpilot',
    branch: '',
    repository: '',
    // Continuation-turn shape: ClawPilot's wrapper template, no marker.
    summary: 'Here is the conversation:\nuser: hello\nassistant: hi there',
    latestPrompt: 'Here is the conversation:\nuser: hello\nassistant: hi there',
    latestPromptTime: Date.now(),
    messageCount: 2,
    toolCallCount: 0,
    lastActivityTime: Date.now(),
    ...overrides,
  };
}

test('cwd containing /clawpilot/ labels the notification as ClawPilot even without the marker', async () => {
  const { app, close } = await launchTmax();
  try {
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession());
    const captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    expect(captured[0].title).toContain('ClawPilot');
    expect(captured[0].title).not.toMatch(/^Copilot/);
  } finally {
    await close();
  }
});

test('sessions outside the Clawpilot folder still label as Copilot', async () => {
  const { app, close } = await launchTmax();
  try {
    await clearCapturedNotifications(app);
    await triggerNotificationViaMain(app, makeSession({
      id: 'control-non-clawpilot',
      cwd: 'C:/projects/tmax',
      summary: 'hello world',
      latestPrompt: 'hello world',
    }));
    const captured = await readCapturedNotifications(app);
    expect(captured.length).toBe(1);
    expect(captured[0].title).toMatch(/^Copilot/);
    expect(captured[0].title).not.toContain('ClawPilot');
  } finally {
    await close();
  }
});
