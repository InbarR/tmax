import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { findSessionById } from '../state/terminal-store';

interface Msg { role: 'user' | 'assistant'; text: string; time: number }

function fmtDay(ts: number): string {
  if (!ts) return 'Unknown date';
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}
function fmtTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function sig(msgs: Msg[]): string {
  const last = msgs[msgs.length - 1];
  return `${msgs.length}:${last ? last.time + last.text.length : 0}`;
}

const POLL_MS = 2000;

/**
 * Right-docked, read-only chat transcript for the *focused* AI pane. Follows
 * focus: click a different pane and it switches to that session. Claude Code
 * shows both sides; Copilot only persists user messages (banner notes it).
 * Live-refreshes while open. Opened from the AI pane's title-bar button.
 */
const TranscriptPanel: React.FC = () => {
  const open = useTerminalStore((s) => s.transcriptOpen);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  // Re-derive when sessions load (provider/title) or focus changes.
  const aiSessionId = useTerminalStore((s) => (focusedId ? s.terminals.get(focusedId)?.aiSessionId : undefined));
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);

  const sess = useMemo(
    () => (aiSessionId ? findSessionById(copilotSessions, claudeCodeSessions, aiSessionId) : null),
    [aiSessionId, copilotSessions, claudeCodeSessions],
  );
  const provider: 'copilot' | 'claude-code' = sess?.provider === 'claude-code' ? 'claude-code' : 'copilot';
  const title = sess?.summary || (aiSessionId ? aiSessionId.slice(0, 8) : '');

  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<string>('');
  const close = useCallback(() => useTerminalStore.setState({ transcriptOpen: false }), []);

  const atBottom = () => {
    const el = bodyRef.current;
    if (!el) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop < 60;
  };
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  };

  // Load + live poll the focused session's transcript.
  useEffect(() => {
    if (!open || !aiSessionId) { setMsgs(null); return; }
    let cancelled = false;
    sigRef.current = '';
    setMsgs(null);

    const fetchOnce = (initial: boolean) => {
      (window.terminalAPI as any).getSessionTimeline(provider, aiSessionId)
        .then((rows: Msg[]) => {
          if (cancelled) return;
          const next = Array.isArray(rows) ? rows : [];
          const nextSig = sig(next);
          if (!initial && nextSig === sigRef.current) return;
          const wasAtBottom = initial || atBottom();
          sigRef.current = nextSig;
          setMsgs(next);
          if (wasAtBottom) scrollToBottom();
        })
        .catch(() => { if (!cancelled && initial) setMsgs([]); });
    };

    fetchOnce(true);
    const timer = setInterval(() => fetchOnce(false), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open, aiSessionId, provider]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  const groups = useMemo(() => {
    const out: { day: string; items: Msg[] }[] = [];
    for (const m of msgs ?? []) {
      const day = fmtDay(m.time);
      let g = out[out.length - 1];
      if (!g || g.day !== day) { g = { day, items: [] }; out.push(g); }
      g.items.push(m);
    }
    return out;
  }, [msgs]);

  if (!open) return null;

  const isCopilot = provider === 'copilot';

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <div className="transcript-titles">
          <span className="transcript-title">{title || 'Transcript'}</span>
          <span className="transcript-sub">
            {aiSessionId ? (isCopilot ? 'Copilot' : 'Claude Code') : 'No AI session in focused pane'}
            {aiSessionId && msgs ? ` · ${msgs.length} message${msgs.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <button className="transcript-close" onClick={close} title="Close (Esc)" aria-label="Close">&#10005;</button>
      </div>
      {aiSessionId && isCopilot && (
        <div className="transcript-disclaimer">
          Copilot CLI only saves your messages, so assistant replies aren't shown here.
        </div>
      )}
      <div className="transcript-body" ref={bodyRef}>
        {!aiSessionId && (
          <div className="transcript-empty">Focus an AI session pane (Copilot or Claude Code) to see its transcript.</div>
        )}
        {aiSessionId && msgs === null && <div className="transcript-empty">Loading transcript…</div>}
        {aiSessionId && msgs !== null && msgs.length === 0 && (
          <div className="transcript-empty">No messages found for this session.</div>
        )}
        {groups.map((g) => (
          <div className="transcript-group" key={g.day}>
            <div className="transcript-day">{g.day}</div>
            {g.items.map((m, i) => (
              <div className={`transcript-msg ${m.role}`} key={i}>
                <div className="transcript-bubble">{m.text}</div>
                <div className="transcript-time">{fmtTime(m.time)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptPanel;
