import { Notification } from 'electron';
import type { CopilotSessionSummary } from '../shared/copilot-types';

const COOLDOWN_MS = 30_000;
const lastNotified = new Map<string, number>();

export function notifyCopilotSession(session: CopilotSessionSummary): void {
  if (session.status !== 'awaitingApproval' && session.status !== 'waitingForUser') {
    return;
  }

  const now = Date.now();
  const lastTime = lastNotified.get(session.id) ?? 0;

  if (now - lastTime < COOLDOWN_MS) {
    return;
  }

  lastNotified.set(session.id, now);

  const title = session.status === 'awaitingApproval'
    ? 'Copilot: Approval Needed'
    : 'Copilot: Waiting for Input';

  const body = session.repository
    ? `${session.repository} (${session.branch || 'unknown branch'})`
    : session.cwd || session.id;

  const notification = new Notification({ title, body });
  notification.show();
}

export function clearNotificationCooldowns(): void {
  lastNotified.clear();
}
