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

// TASK-71: cached copy of the renderer's `sessionNameOverrides` map. The
// renderer fires SESSION_NAME_OVERRIDES_SYNC on every rename and once at
// startup after restoring tmax-session.json; main.ts also seeds this from
// the on-disk session store so the very first notification of a session
// (fired before the renderer connects) still picks up an existing override.
let sessionNameOverrides: Record<string, string> = {};
export function setSessionNameOverrides(map: Record<string, string>): void {
  sessionNameOverrides = { ...map };
}
export function getSessionNameOverride(sessionId: string): string {
  const raw = sessionNameOverrides[sessionId];
  return typeof raw === 'string' ? raw.trim() : '';
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

  // E2E test hook: capture every notification body main builds so tests
  // can assert on the override-vs-summary precedence without having to
  // intercept the OS toast surface itself. Production-safe (gated on
  // TMAX_E2E so the array never grows in normal runs).
  if (process.env.TMAX_E2E === '1') {
    const g = globalThis as any;
    if (!Array.isArray(g.__capturedNotifications)) g.__capturedNotifications = [];
    g.__capturedNotifications.push({ title, body });
  }

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
 * Line 1 precedence (TASK-71):
 *   1. user-set rename override (sessionNameOverrides[id]) - synced from
 *      the renderer so renamed panes show their custom name in toasts.
 *   2. session.summary (firstPrompt for active sessions, skipping the
 *      auto-generated slug like "calm-river").
 *   3. session.repository.
 *   4. cwd folder name.
 *   5. id slice (last-resort identifier).
 */
function buildNotificationBody(session: CopilotSessionSummary): string {
  const parts: string[] = [];

  const cwdFolder = deriveCwdFolder(session.cwd);
  const branch = session.branch || '';

  // TASK-71: user override wins. Empty string means "no override - fall
  // back to summary."
  const override = getSessionNameOverride(session.id);

  // Prefer summary (firstPrompt for active sessions). Skip if it's just
  // the auto-generated slug.
  const summary = session.summary && session.summary !== session.slug
    ? session.summary.trim().replace(/\s+/g, ' ')
    : '';
  const rawName = override || summary || session.repository || cwdFolder || session.id.slice(0, 8);
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
