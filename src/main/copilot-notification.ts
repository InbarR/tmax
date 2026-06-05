import { Notification, app } from 'electron';

// TASK-159: appended to notification titles when running a dev tmax
// (electron-forge start) so users with both a dev and packaged tmax open
// at once can tell the toasts apart at a glance. No-op in packaged builds.
const DEV_TITLE_SUFFIX = app.isPackaged ? '' : ' (DEV)';
import * as path from 'path';
import * as fs from 'fs';
import type { CopilotSessionStatus, CopilotSessionSummary } from '../shared/copilot-types';
import { stripClawpilotContext } from '../shared/copilot-types';

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

// GH #129: these per-session Maps were only cleared on app quit, so they grew
// without bound on long-running dev boxes that create many sessions. Cap them
// (FIFO-evict the oldest) and expose a per-session forget for the removed path.
const MAX_TRACKED_SESSIONS = 500;
function evictTrackedSessions(): void {
  while (lastNotified.size > MAX_TRACKED_SESSIONS) {
    const k = lastNotified.keys().next().value as string;
    lastNotified.delete(k);
    lastStatus.delete(k);
  }
  while (lastStatus.size > MAX_TRACKED_SESSIONS) {
    lastStatus.delete(lastStatus.keys().next().value as string);
  }
}
/** Drop a session's tracked notification state when the session is removed. */
export function forgetNotificationState(sessionId: string): void {
  lastNotified.delete(sessionId);
  lastStatus.delete(sessionId);
}

// TASK-164: cross-session body dedup. ClawPilot spawns two distinct
// sessions per turn (a Claude Code SDK session + a parallel Copilot
// session), and the per-session flicker cooldown above doesn't catch
// them because their IDs differ. This window collapses duplicate-body
// toasts that fire within DEDUP_WINDOW_MS, regardless of which session
// produced them. Body is normalized (trim+lowercase+slice) so minor
// whitespace differences don't defeat the match.
const DEDUP_WINDOW_MS = 8_000;
const DEDUP_BODY_PREFIX_LEN = 160;
let recentBodyKeys: Array<{ key: string; time: number }> = [];
function bodyDedupKey(body: string): string {
  return body.trim().slice(0, DEDUP_BODY_PREFIX_LEN).toLowerCase().replace(/\s+/g, ' ');
}
function isDuplicateOfRecent(body: string): boolean {
  if (!body) return false;
  const now = Date.now();
  // Drop expired entries.
  recentBodyKeys = recentBodyKeys.filter((e) => now - e.time <= DEDUP_WINDOW_MS);
  const key = bodyDedupKey(body);
  return recentBodyKeys.some((e) => e.key === key);
}
function rememberBody(body: string): void {
  if (!body) return;
  recentBodyKeys.push({ key: bodyDedupKey(body), time: Date.now() });
  // GH #129: hard cap so a burst of notifications can't grow this unbounded
  // between the time-based prunes in isDuplicateOfRecent().
  if (recentBodyKeys.length > 100) recentBodyKeys = recentBodyKeys.slice(-50);
}

// Per-process opt-out gate. Wired from main.ts based on the `aiSessionNotifications`
// config flag (default true). When the flag is false we skip the OS notification
// entirely - useful for users running an external hook plugin (e.g.
// claude-notifications-go) who don't want both surfaces firing.
let enabled = true;
export function setAiSessionNotificationsEnabled(value: boolean): void {
  enabled = value;
}

// TASK-156: per-process cached copy of `notificationExcludeStrings`. Wired
// from main.ts on startup and on every config change. Matching is a plain
// case-insensitive substring against title OR body - intentionally no regex
// or globs (kept simple to author and predictable when users paste in noisy
// agent output). Empty / whitespace-only entries are ignored at match time
// so the Settings textarea can keep blank rows while the user is typing.
let excludeStrings: string[] = [];
export function setNotificationExcludeStrings(values: readonly string[] | undefined | null): void {
  excludeStrings = Array.isArray(values) ? values.slice() : [];
}
function isExcluded(title: string, body: string): boolean {
  if (excludeStrings.length === 0) return false;
  const haystackLower = `${title}\n${body}`.toLowerCase();
  const haystackRaw = `${title}\n${body}`;
  for (const raw of excludeStrings) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // TASK-155: entries that start and end with "/" are treated as regex.
    // Anything else stays a case-insensitive substring match (TASK-156).
    // A malformed regex is ignored gracefully so users can keep typing
    // without breaking notifications mid-edit.
    if (trimmed.length >= 3 && trimmed.startsWith('/') && trimmed.endsWith('/')) {
      const pattern = trimmed.slice(1, -1);
      if (!pattern) continue;
      try {
        const re = new RegExp(pattern, 'i');
        if (re.test(haystackRaw)) return true;
      } catch { /* invalid regex - ignore this entry */ }
      continue;
    }
    if (haystackLower.includes(trimmed.toLowerCase())) return true;
  }
  return false;
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
  evictTrackedSessions(); // GH #129: keep the per-session Maps bounded.
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
  const title = `${agentLabel} - ${stateLabel}${DEV_TITLE_SUFFIX}`;

  const body = buildNotificationBody(session);
  const icon = resolveNotificationIcon(session.provider);

  // TASK-156: user-configured deny-list. Drop the toast entirely if any
  // exclude string matches the rendered title or body. We bail here -
  // AFTER lastStatus was updated above so removing the rule won't fire
  // a retroactive toast for the same turn, but BEFORE the E2E capture
  // and notification.show() so tests can assert on suppression and
  // suppressed turns make no sound. We intentionally do NOT extend this
  // to version-checker.ts: update notifications should fire regardless
  // of an exclude list aimed at AI agent noise.
  if (isExcluded(title, body)) return;

  // TASK-164: drop a near-identical body that already fired from a sibling
  // session within DEDUP_WINDOW_MS. ClawPilot spawns a CC + Copilot pair
  // per turn; the per-session cooldown above keys on session.id, so it
  // can't see the cross-session duplicate. We dedup ONLY on body here -
  // the same body from two different sessions in an 8s window is the
  // ClawPilot pair shape.
  if (isDuplicateOfRecent(body)) return;
  rememberBody(body);

  // E2E test hook: capture every notification body main builds so tests
  // can assert on the override-vs-summary precedence without having to
  // intercept the OS toast surface itself. Production-safe (gated on
  // TMAX_E2E so the array never grows in normal runs).
  if (process.env.TMAX_E2E === '1') {
    const g = globalThis as any;
    if (!Array.isArray(g.__capturedNotifications)) g.__capturedNotifications = [];
    g.__capturedNotifications.push({ title, body });
  }

  const notification = new Notification({ title, body, icon });
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
  const summaryClean = session.summary && session.summary !== session.slug
    ? stripClawpilotContext(session.summary.trim().replace(/\s+/g, ' '))
    : '';
  const rawName = override || summaryClean || session.repository || cwdFolder || session.id.slice(0, 8);
  const NAME_MAX = 60;
  const displayName = rawName.length > NAME_MAX
    ? rawName.slice(0, NAME_MAX - 1) + '…'
    : rawName;

  parts.push(branch ? `${displayName} (${branch})` : displayName);

  // Latest prompt, but skip when it's the same as the chosen displayName
  // (single-prompt sessions where summary === latestPrompt would otherwise
  // duplicate).
  const promptClean = stripClawpilotContext((session.latestPrompt || '').trim().replace(/\s+/g, ' '));
  if (promptClean && promptClean !== rawName) {
    const PROMPT_MAX = 80;
    const truncated = promptClean.length > PROMPT_MAX ? promptClean.slice(0, PROMPT_MAX - 1) + '…' : promptClean;
    parts.push(`"${truncated}"`);
  }

  return parts.join('\n');
}

/**
 * Resolve a per-provider icon path for the Electron Notification. Missing
 * files silently fall back to the app's own icon - we don't want a broken
 * notification just because an asset is missing.
 */
function resolveNotificationIcon(
  provider: CopilotSessionSummary['provider'] | undefined,
): string | undefined {
  let fileName: string | null = null;
  if (provider === 'claude-code') fileName = 'claude.png';
  else if (provider === 'copilot') fileName = 'copilot.png';
  if (!fileName) return undefined;
  const candidates = [
    path.join(app.getAppPath(), 'assets', fileName),
    path.join(process.resourcesPath || '', 'assets', fileName),
    path.join(__dirname, '..', '..', 'assets', fileName),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
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
  recentBodyKeys = [];
}
