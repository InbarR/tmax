import { Notification } from 'electron';
import type { CopilotSessionStatus, CopilotSessionSummary } from '../shared/copilot-types';

// Short cooldown to debounce parser flicker within the SAME status
// transition (e.g. file watcher re-emits the same waitingForUser tick
// twice in quick succession). Notifications across distinct turns are
// gated by the transition check below, not by this cooldown - so a user
// who is actively prompting back and forth still gets a notification on
// each completed turn (TASK-64 follow-up: pre-fix the 30 s cooldown
// silently swallowed every notification after the first one within
// 30 s, which made fast-paced sessions look broken).
const FLICKER_COOLDOWN_MS = 5_000;
const lastNotified = new Map<string, number>();
const lastStatus = new Map<string, CopilotSessionStatus>();

// Per-process opt-out gate. Wired from main.ts based on the `aiSessionNotifications`
// config flag (default true). When the flag is false we skip the OS notification
// entirely - useful for users running an external hook plugin (e.g.
// claude-notifications-go) who don't want both surfaces firing.
let enabled = true;
export function setAiSessionNotificationsEnabled(value: boolean): void {
  enabled = value;
}

function isAttentionStatus(status: CopilotSessionStatus | undefined): boolean {
  return status === 'awaitingApproval' || status === 'waitingForUser';
}

export function notifyCopilotSession(session: CopilotSessionSummary): void {
  if (!enabled) {
    // Still update the cached status so when notifications are re-enabled
    // we don't immediately fire for the existing steady state.
    lastStatus.set(session.id, session.status);
    return;
  }

  const prev = lastStatus.get(session.id);
  lastStatus.set(session.id, session.status);

  // Only fire on the transition INTO an attention status. While the
  // session is in steady-state attention (parser re-emits the same
  // status on every file change during a single turn) we stay silent.
  if (!isAttentionStatus(session.status)) return;
  if (isAttentionStatus(prev)) return;

  // Belt-and-suspenders flicker debounce: if the parser bounces
  // attention -> not-attention -> attention within 5 s for the same
  // session, treat the second hit as a flicker and skip.
  const now = Date.now();
  const lastTime = lastNotified.get(session.id) ?? 0;
  if (now - lastTime < FLICKER_COOLDOWN_MS) return;
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
  lastStatus.clear();
}
