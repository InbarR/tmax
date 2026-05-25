import type { CopilotSessionSummary, CopilotSessionStatus } from '../../shared/copilot-types';

const STATUS_LABEL: Record<CopilotSessionStatus, string> = {
  idle: 'idle',
  thinking: 'thinking through your request',
  executingTool: 'running a tool',
  waitingForUser: 'waiting for your next message',
  awaitingApproval: 'waiting for your approval',
};

function shortenPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts.slice(-2).join('/');
}

function relativeAge(ms: number | undefined): string | null {
  if (!ms) return null;
  const delta = Date.now() - ms;
  if (delta < 0) return null;
  if (delta < 60_000) return 'just now';
  const mins = Math.floor(delta / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Build the plain-text hover tooltip shown on the pane title bar and the
 * tab. Mirrors the Session Summary popup's layout: header / context /
 * activity / opener / latest. Native browser tooltips only render plain
 * text with line breaks, so this is a `\n`-joined string.
 */
export function buildSessionHoverText(session: CopilotSessionSummary | undefined | null): string | null {
  if (!session) return null;
  const providerLabel = session.provider === 'claude-code' ? 'Claude Code' : 'Copilot';
  const header = (session.firstPrompt || session.summary || session.latestPrompt || '').trim();
  const lines: string[] = [];
  if (header) lines.push(header);

  const where = session.repository || shortenPath(session.cwd || '');
  const branch = session.branch;
  if (where && branch) {
    lines.push(`Working on ${where} on ${branch} with ${providerLabel}`);
  } else if (where) {
    lines.push(`Working on ${where} with ${providerLabel}`);
  } else {
    lines.push(`Using ${providerLabel}`);
  }

  const activityBits: string[] = [];
  if (session.messageCount) {
    activityBits.push(`${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`);
  }
  const age = relativeAge(session.lastActivityTime);
  if (age) activityBits.push(`last active ${age}`);
  if (activityBits.length) lines.push(activityBits.join(' · '));

  if (session.status && STATUS_LABEL[session.status]) {
    lines.push(`Right now: ${STATUS_LABEL[session.status]}`);
  }

  const first = session.firstPrompt?.trim();
  if (first && first !== header) {
    lines.push('');
    lines.push(`How it started: ${first}`);
  }

  const latest = session.latestPrompt?.trim();
  if (latest && latest !== header && latest !== first) {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push(`Most recent: ${latest}`);
  }

  return lines.length ? lines.join('\n') : null;
}
