import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTerminalStore } from '../state/terminal-store';

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
// Cheap change signature so polling only re-renders when something actually
// changed (avoids resetting scroll every 2s).
function sig(msgs: Msg[]): string {
  const last = msgs[msgs.length - 1];
  return `${msgs.length}:${last ? last.time + last.text.length : 0}`;
}

const POLL_MS = 2000;

/**
 * Right-docked, read-only chat transcript for an AI session. Pushes the
 * terminal layout (it's a flex sibling of .layout-area, not an overlay).
 * Claude Code shows both sides; Copilot only persists user messages, so a
 * banner says so. Live-refreshes while open (issue #124 / TASK-146).
 */
const TranscriptPanel: React.FC = () => {
  const session = useTerminalStore((s) => s.transcriptSession);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<string>('');
  const close = useCallback(() => useTerminalStore.setState({ transcriptSession: null }), []);

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

  // Initial load + live polling while the panel is open.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    sigRef.current = '';
    setMsgs(null);

    const fetchOnce = (initial: boolean) => {
      (window.terminalAPI as any).getSessionTimeline(session.provider, session.sessionId)
        .then((rows: Msg[]) => {
          if (cancelled) return;
          const next = Array.isArray(rows) ? rows : [];
          const nextSig = sig(next);
          if (!initial && nextSig === sigRef.current) return; // nothing new
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
  }, [session?.sessionId, session?.provider]);

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [session, close]);

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

  if (!session) return null;

  const isCopilot = session.provider === 'copilot';

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <div className="transcript-titles">
          <span className="transcript-title">{session.title || 'Session'}</span>
          <span className="transcript-sub">
            {isCopilot ? 'Copilot' : 'Claude Code'}
            {msgs ? ` · ${msgs.length} message${msgs.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <button className="transcript-close" onClick={close} title="Close (Esc)" aria-label="Close">&#10005;</button>
      </div>
      {isCopilot && (
        <div className="transcript-disclaimer">
          Copilot CLI only saves your messages, so assistant replies aren't shown here.
        </div>
      )}
      <div className="transcript-body" ref={bodyRef}>
        {msgs === null && <div className="transcript-empty">Loading transcript…</div>}
        {msgs !== null && msgs.length === 0 && (
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
