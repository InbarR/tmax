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

  const body = buildNotificationBody(session);

  const notification = new Notification({ title, body });
  notification.show();
}

/**
 * Build a two-line notification body answering the two questions a
 * notification needs to answer in the half-second the user looks at it:
 *  - WHERE is this session?  (line 1, "folder (branch)")
 *  - WHAT was just said?     (line 2, the latest user prompt in quotes)
 *
 * The slug nickname Claude Code generates ("calm-river", etc.) is
 * deliberately omitted - it's random and doesn't help the user
 * disambiguate sessions in practice, just adds visual noise.
 *
 * Falls back to one line for sessions with no latest prompt yet, and to
 * raw cwd / id when the session has no repo/branch metadata.
 */
function buildNotificationBody(session: CopilotSessionSummary): string {
  const parts: string[] = [];

  const cwdFolder = deriveCwdFolder(session.cwd);
  const repoOrFolder = session.repository || cwdFolder || '';
  const branch = session.branch || '';

  let location = '';
  if (repoOrFolder && branch) {
    location = `${repoOrFolder} (${branch})`;
  } else if (repoOrFolder) {
    location = repoOrFolder;
  } else if (session.cwd) {
    location = session.cwd;
  } else {
    location = session.id.slice(0, 8);
  }
  parts.push(location);

  const prompt = (session.latestPrompt || '').trim().replace(/\s+/g, ' ');
  if (prompt) {
    const max = 80;
    const truncated = prompt.length > max ? prompt.slice(0, max - 1) + '…' : prompt;
    parts.push(`"${truncated}"`);
  }

  return parts.join('\n');
}

function deriveCwdFolder(cwd: string | undefined): string {
  if (!cwd) return '';
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

export function clearNotificationCooldowns(): void {
  lastNotified.clear();
  lastStatus.clear();
}
