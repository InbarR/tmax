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

// Click handler injected from main.ts. We can't import mainWindow here
// without creating a cycle, so the wiring goes the other way: main.ts
// calls setNotificationClickHandler() once after window creation, and
// the handler restores/focuses the window when the user clicks a toast.
let clickHandler: (() => void) | null = null;
export function setNotificationClickHandler(handler: (() => void) | null): void {
  clickHandler = handler;
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
  if (clickHandler) {
    notification.on('click', () => {
      try { clickHandler?.(); } catch { /* ignore */ }
    });
  }
  notification.show();
}

/**
 * Build a notification body that answers two questions in the half-
 * second a toast is on screen:
 *  - WHICH session is this? (line 1: pane/session name + branch)
 *  - WHAT was just said?    (line 2: latest user prompt, in quotes)
 *
 * Line 1 uses session.summary as the primary identifier - that's the
 * same source the renderer uses for the pane title (firstPrompt for
 * sessions the user has prompted in, falling back to cwdFolder for
 * brand-new ones). The auto-generated slug ("calm-river", etc.) is
 * deliberately skipped - random adjective+noun pairs add visual noise
 * without helping the user identify the pane.
 *
 * NOTE: user-set rename overrides (sessionNameOverrides) live in
 * renderer-only state today. Without an IPC sync to main we can't see
 * them here, so a renamed pane still gets the auto-derived name in the
 * notification. Follow-up task tracks adding that sync.
 */
function buildNotificationBody(session: CopilotSessionSummary): string {
  const parts: string[] = [];

  const cwdFolder = deriveCwdFolder(session.cwd);
  const branch = session.branch || '';

  // Prefer summary (firstPrompt for active sessions). Skip if it's just
  // the auto-generated slug.
  const summary = session.summary && session.summary !== session.slug
    ? session.summary.trim().replace(/\s+/g, ' ')
    : '';
  const rawName = summary || session.repository || cwdFolder || session.id.slice(0, 8);
  const NAME_MAX = 60;
  const displayName = rawName.length > NAME_MAX
    ? rawName.slice(0, NAME_MAX - 1) + '…'
    : rawName;

  parts.push(branch ? `${displayName} (${branch})` : displayName);

  // Latest prompt, but skip when it's the same as the chosen displayName
  // (single-prompt sessions where summary === latestPrompt would otherwise
  // duplicate).
  const prompt = (session.latestPrompt || '').trim().replace(/\s+/g, ' ');
  if (prompt && prompt !== rawName) {
    const PROMPT_MAX = 80;
    const truncated = prompt.length > PROMPT_MAX ? prompt.slice(0, PROMPT_MAX - 1) + '…' : prompt;
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
