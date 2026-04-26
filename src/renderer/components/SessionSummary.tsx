import React, { useEffect } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { CopilotSessionSummary, CopilotSessionStatus } from '../../shared/copilot-types';

function shortPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

function relativePhrase(ts: number): string {
  if (!ts) return 'a while ago';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 30) return 'just now';
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 120) return 'a minute ago';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 5400) return 'about an hour ago';
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 172800) return 'yesterday';
  return `${Math.floor(diff / 86400)} days ago`;
}

function durationPhrase(ms: number): string {
  if (ms < 60_000) return 'less than a minute';
  if (ms < 3600_000) return `about ${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (ms < 86400_000) {
    const hrs = ms / 3600_000;
    if (hrs < 1.5) return 'about an hour';
    if (hrs < 24) return `about ${Math.round(hrs)} hours`;
  }
  const days = Math.round(ms / 86400_000);
  return days === 1 ? 'a day' : `${days} days`;
}

function turnsPhrase(n: number): string {
  if (n <= 0) return 'no messages yet';
  if (n === 1) return 'one message';
  if (n === 2) return 'a couple of messages';
  if (n < 6) return `${n} messages`;
  if (n < 15) return `${n} messages back and forth`;
  if (n < 50) return `${n} exchanges so far`;
  if (n < 200) return 'a long conversation - dozens of exchanges';
  return 'a very long conversation';
}

const STATUS_PHRASING: Record<CopilotSessionStatus, string> = {
  idle: 'idle - nothing has happened in the last few seconds.',
  thinking: 'thinking through your request.',
  executingTool: 'running tools to make changes.',
  awaitingApproval: 'paused, waiting for you to approve a tool call.',
  waitingForUser: "waiting for your next message.",
};

const STATUS_COLORS: Record<CopilotSessionStatus, string> = {
  idle: '#6c7086',
  thinking: '#f9e2af',
  executingTool: '#89b4fa',
  awaitingApproval: '#f38ba8',
  waitingForUser: '#a6e3a1',
};

const PROVIDER_NAME: Record<string, string> = {
  copilot: 'Copilot CLI',
  'claude-code': 'Claude Code',
};

const SessionSummary: React.FC = () => {
  const sessionId = useTerminalStore((s) => s.sessionSummaryRequest);
  const close = () => useTerminalStore.getState().clearSessionSummary();

  useEffect(() => {
    if (!sessionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sessionId]);

  const session = useTerminalStore((s): CopilotSessionSummary | null => {
    if (!sessionId) return null;
    return (
      s.claudeCodeSessions.find((x) => x.id === sessionId) ||
      s.copilotSessions.find((x) => x.id === sessionId) ||
      null
    );
  });
  const summaryOverride = useTerminalStore((s) => sessionId ? s.sessionNameOverrides[sessionId] : '');

  if (!sessionId || !session) return null;

  const title = summaryOverride || session.summary || session.id.slice(0, 8);
  const provider = PROVIDER_NAME[session.provider] || session.provider;
  const folder = shortPath(session.cwd);
  const branch = session.branch ? ` on the ${session.branch} branch` : '';
  const lastPromptAgo = session.latestPromptTime ? relativePhrase(session.latestPromptTime) : null;
  const statusText = STATUS_PHRASING[session.status] || 'in an unknown state.';
  const statusColor = STATUS_COLORS[session.status] || '#6c7086';

  // Estimate session duration: from latestPrompt back to (lastActivityTime
  // can be roughly when the session was last active overall). If we don't
  // have a clean firstActivityTime, fall back to "since [ago]".
  const messageCount = session.messageCount || 0;
  const durationMs =
    session.latestPromptTime && session.lastActivityTime
      ? Math.max(0, session.lastActivityTime - (session.lastActivityTime - durationFromCount(messageCount, session.latestPromptTime)))
      : 0;

  // Cleaner: estimate "active over the last X" using lastActivityTime - first message time
  // We only have lastActivityTime, not first. Approximate using messageCount as a fallback signal.
  // For now, keep it simple: report when the session was last active.
  const lastActivityAgo = session.lastActivityTime ? relativePhrase(session.lastActivityTime) : null;

  const lines: React.ReactNode[] = [];

  // Where: project + branch + provider, on one line.
  if (folder) {
    lines.push(
      <p key="where">
        Working on <strong>{folder}</strong>{branch} with <strong>{provider}</strong>.
      </p>,
    );
  }

  // History: how it started + how much has been going on.
  if (session.summary && lastActivityAgo) {
    const turns = turnsPhrase(messageCount);
    lines.push(
      <p key="origin">
        Started <strong>{lastActivityAgo === 'just now' ? 'just now' : lastActivityAgo}</strong>{' '}
        with: <em>"{session.summary}"</em>
        {messageCount > 1 ? <> &nbsp;·&nbsp; {turns}.</> : null}
      </p>,
    );
  }

  // Now: current status, with a colored dot mirroring the AI sessions list.
  lines.push(
    <p key="status">
      <span
        className="session-summary-status-dot"
        style={{ background: statusColor }}
        aria-hidden
      />
      <strong>Right now:</strong> {statusText}
    </p>,
  );

  // What you just asked.
  if (session.latestPrompt && session.latestPrompt !== session.summary) {
    lines.push(
      <p key="latest">
        Your most recent message{lastPromptAgo ? ` ${lastPromptAgo}` : ''}: <em>"{session.latestPrompt}"</em>
      </p>,
    );
  } else if (session.latestPrompt && session.latestPrompt === session.summary && messageCount === 1) {
    lines.push(
      <p key="oneshot">
        That first prompt is also the only one so far - the conversation hasn't continued yet.
      </p>,
    );
  }

  return (
    <div className="palette-backdrop" onClick={close} style={{ paddingTop: 80 }}>
      <div
        className="session-summary-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="session-summary-header">
          <span className="session-summary-title" title={title}>{title}</span>
          <button className="session-summary-close" onClick={close} aria-label="Close">&times;</button>
        </div>
        <div className="session-summary-body">
          {lines}
        </div>
      </div>
    </div>
  );
};

// Reserved for a future enhancement: estimate session start time from
// message count. Today we only persist lastActivityTime in the summary.
function durationFromCount(_count: number, _latestTs: number): number {
  return 0;
}

export default SessionSummary;
