import React, { useEffect, useState } from 'react';
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
  waitingForUser: 'waiting for your next message.',
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

// Common acknowledgments that aren't really new directions in the
// conversation. Filtered out of the timeline so the picks are real
// turning points, not "k" / "yes" / "continue" noise.
const TRIVIAL_ACKS = new Set([
  'k', 'ok', 'okay', 'yes', 'no', 'sure', 'go', 'do it', 'thanks', 'thx',
  'continue', 'cont', 'go on', 'next', 'ship it', 'push it', 'great',
  'good', 'nice', 'lgtm', 'looks good', 'yep', 'nope', 'right', 'correct',
  'true', 'false', '1', '2', '3',
]);

function isTrivial(p: string): boolean {
  const trimmed = p.trim().toLowerCase();
  if (trimmed.length < 4) return true;
  if (TRIVIAL_ACKS.has(trimmed)) return true;
  // single-word ack with a punctuation mark
  if (/^[a-z]{1,8}[.!?]$/i.test(trimmed)) return true;
  return false;
}

/**
 * Picks a representative subset of prompts to tell the session's story:
 * always include the first and last, plus a few evenly-spaced from the
 * middle. Skips trivial acknowledgments unless the conversation is so
 * short that they're all there is.
 */
function pickStoryPrompts(all: string[]): { first: string | null; middle: string[]; last: string | null } {
  if (all.length === 0) return { first: null, middle: [], last: null };
  if (all.length === 1) return { first: all[0], middle: [], last: null };

  const meaningful = all.filter((p) => !isTrivial(p));
  const pool = meaningful.length >= 2 ? meaningful : all;

  const first = pool[0];
  const last = pool[pool.length - 1];
  const inner = pool.slice(1, -1);
  // Sample up to 4 prompts evenly from the middle.
  const max = 4;
  let middle: string[] = [];
  if (inner.length <= max) {
    middle = inner;
  } else {
    const step = inner.length / max;
    for (let i = 0; i < max; i++) {
      middle.push(inner[Math.floor(step * i + step / 2)]);
    }
  }
  return { first, middle, last };
}

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

  // Fetch the prompt history when the popover opens. Each prompt comes back
  // already cleaned by the parser (XML-stripped, trimmed, capped at 300 chars).
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  useEffect(() => {
    if (!sessionId || !session) { setPrompts([]); return; }
    setLoadingPrompts(true);
    const api = window.terminalAPI as any;
    const fetcher = session.provider === 'claude-code' ? api.getClaudeCodePrompts : api.getCopilotPrompts;
    fetcher(sessionId)
      .then((p: string[] | undefined) => setPrompts(Array.isArray(p) ? p : []))
      .catch(() => setPrompts([]))
      .finally(() => setLoadingPrompts(false));
  }, [sessionId, session?.provider]);

  if (!sessionId || !session) return null;

  const title = summaryOverride || session.summary || session.id.slice(0, 8);
  const provider = PROVIDER_NAME[session.provider] || session.provider;
  const folder = shortPath(session.cwd);
  const branch = session.branch ? ` on the ${session.branch} branch` : '';
  const lastPromptAgo = session.latestPromptTime ? relativePhrase(session.latestPromptTime) : null;
  const statusText = STATUS_PHRASING[session.status] || 'in an unknown state.';
  const statusColor = STATUS_COLORS[session.status] || '#6c7086';
  const lastActivityAgo = session.lastActivityTime ? relativePhrase(session.lastActivityTime) : null;
  const messageCount = session.messageCount || 0;

  const story = pickStoryPrompts(prompts);

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
          {folder && (
            <p>
              Working on <strong>{folder}</strong>{branch} with <strong>{provider}</strong>.
            </p>
          )}

          {messageCount > 0 && lastActivityAgo && (
            <p>
              Last active {lastActivityAgo}. {turnsPhrase(messageCount).replace(/^./, (c) => c.toUpperCase())}.
            </p>
          )}

          <p>
            <span
              className="session-summary-status-dot"
              style={{ background: statusColor }}
              aria-hidden
            />
            <strong>Right now:</strong> {statusText}
          </p>

          {loadingPrompts && prompts.length === 0 && (
            <p><em>Loading conversation history...</em></p>
          )}

          {story.first && (
            <div className="session-summary-section">
              <div className="session-summary-section-label">How it started</div>
              <blockquote className="session-summary-quote">{story.first}</blockquote>
            </div>
          )}

          {story.middle.length > 0 && (
            <div className="session-summary-section">
              <div className="session-summary-section-label">Along the way</div>
              {story.middle.map((p, i) => (
                <blockquote key={i} className="session-summary-quote">{p}</blockquote>
              ))}
            </div>
          )}

          {story.last && (
            <div className="session-summary-section">
              <div className="session-summary-section-label">
                Most recent{lastPromptAgo ? ` (${lastPromptAgo})` : ''}
              </div>
              <blockquote className="session-summary-quote">{story.last}</blockquote>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionSummary;
