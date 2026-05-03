import { Notification } from 'electron';
import type { CopilotSessionSummary } from '../shared/copilot-types';

const COOLDOWN_MS = 30_000;
const lastNotified = new Map<string, number>();

// Per-process opt-out gate. Wired from main.ts based on the `aiSessionNotifications`
// config flag (default true). When the flag is false we skip the OS notification
// entirely - useful for users running an external hook plugin (e.g.
// claude-notifications-go) who don't want both surfaces firing.
let enabled = true;
export function setAiSessionNotificationsEnabled(value: boolean): void {
  enabled = value;
}

export function notifyCopilotSession(session: CopilotSessionSummary): void {
  if (!enabled) return;
  if (session.status !== 'awaitingApproval' && session.status !== 'waitingForUser') {
    return;
  }

  const now = Date.now();
  const lastTime = lastNotified.get(session.id) ?? 0;

  if (now - lastTime < COOLDOWN_MS) {
    return;
  }

  lastNotified.set(session.id, now);

  // Provider-aware label so users can tell at a glance which agent surfaced
  // the notification. Both providers share the awaiting/waiting status set;
  // semantics differ slightly per provider but the user-visible meaning is
  // the same: the agent finished a turn / needs your attention.
  const isClaude = session.provider === 'claude-code';
  const agentLabel = isClaude ? 'Claude Code' : 'Copilot';
  const stateLabel = session.status === 'awaitingApproval'
    ? 'Approval Needed'
    : isClaude ? 'Session Ready' : 'Waiting for Input';
  const title = `${agentLabel}: ${stateLabel}`;

  const body = session.repository
    ? `${session.repository} (${session.branch || 'unknown branch'})`
    : session.cwd || session.id;

  const notification = new Notification({ title, body });
  notification.show();
}

export function clearNotificationCooldowns(): void {
  lastNotified.clear();
}
