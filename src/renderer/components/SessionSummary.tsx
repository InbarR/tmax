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
  if (diff < 7200) return 'an hour ago';
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 172800) return 'yesterday';
  return `${Math.floor(diff / 86400)} days ago`;
}

const STATUS_PHRASING: Record<CopilotSessionStatus, string> = {
  idle: "The agent is idle - nothing's happening right now.",
  thinking: 'The agent is thinking through your request.',
  executingTool: 'The agent is running tools.',
  awaitingApproval: 'The agent is waiting for you to approve a tool call.',
  waitingForUser: "The agent is waiting for your next message.",
};

const PROVIDER_NAME: Record<string, string> = {
  copilot: 'Copilot CLI',
  'claude-code': 'Claude Code',
};

const SessionSummary: React.FC = () => {
  const sessionId = useTerminalStore((s) => s.sessionSummaryRequest);
  const close = () => useTerminalStore.getState().clearSessionSummary();

  // ESC closes
  useEffect(() => {
    if (!sessionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sessionId]);

  // Look up the session by ID across both providers.
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
  const lastActivity = session.lastActivityTime ? relativePhrase(session.lastActivityTime) : null;
  const lastPromptAgo = session.latestPromptTime ? relativePhrase(session.latestPromptTime) : null;
  const status = STATUS_PHRASING[session.status] || 'Status unknown.';

  // Build the narrative paragraph by paragraph. Keep it conversational - the
  // user asked for a story, not a metrics dump.
  const lines: React.ReactNode[] = [];

  // Where: project + branch + provider
  if (folder) {
    lines.push(
      <p key="where">
        Working on <strong>{folder}</strong>{branch} with <strong>{provider}</strong>.
      </p>,
    );
  }

  // Origin: how the session started, when
  if (session.summary && lastActivity) {
    lines.push(
      <p key="origin">
        Started {lastActivity === 'just now' ? 'just now' : lastActivity.replace(/ ago$/, ' ago')}{' '}
        with: <em>"{session.summary}"</em>
      </p>,
    );
  }

  // Now: current status
  lines.push(
    <p key="status"><strong>Right now:</strong> {status}</p>,
  );

  // What you just asked
  if (session.latestPrompt && session.latestPrompt !== session.summary) {
    lines.push(
      <p key="latest">
        Your most recent message{lastPromptAgo ? ` (${lastPromptAgo})` : ''}: <em>"{session.latestPrompt}"</em>
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

export default SessionSummary;
