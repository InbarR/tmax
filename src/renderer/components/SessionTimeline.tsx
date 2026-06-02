import React, { useEffect, useState, useMemo } from 'react';

interface TimelineEntry { text: string; time: number }

interface Props {
  provider: 'copilot' | 'claude-code';
  sessionId: string;
  title: string;
  onClose: () => void;
}

function fmtDay(ts: number): string {
  if (!ts) return 'Unknown date';
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Read-only timeline of a session's user prompts, each with its timestamp.
 * Data comes from the session files (which carry per-message timestamps) via
 * getSessionTimeline, so it covers both Copilot and Claude Code sessions
 * (issue #124 - the live chat is drawn by the CLI, but tmax has the history).
 */
const SessionTimeline: React.FC<Props> = ({ provider, sessionId, title, onClose }) => {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (window.terminalAPI as any).getSessionTimeline(provider, sessionId)
      .then((rows: TimelineEntry[]) => { if (!cancelled) setEntries(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [provider, sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Group prompts under a per-day header for readability.
  const groups = useMemo(() => {
    const out: { day: string; items: TimelineEntry[] }[] = [];
    for (const e of entries ?? []) {
      const day = fmtDay(e.time);
      let g = out[out.length - 1];
      if (!g || g.day !== day) { g = { day, items: [] }; out.push(g); }
      g.items.push(e);
    }
    return out;
  }, [entries]);

  return (
    <div className="switcher-backdrop" onClick={onClose}>
      <div className="switcher session-timeline" onClick={(e) => e.stopPropagation()}>
        <div className="session-timeline-header">
          <div className="session-timeline-titles">
            <span className="session-timeline-title">{title || 'Session timeline'}</span>
            <span className="session-timeline-sub">
              {provider === 'claude-code' ? 'Claude Code' : 'Copilot'}
              {entries ? ` · ${entries.length} prompt${entries.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <button className="session-timeline-close" onClick={onClose} title="Close (Esc)" aria-label="Close">&#10005;</button>
        </div>
        <div className="switcher-list session-timeline-list">
          {entries === null && <div className="switcher-empty">Loading timeline…</div>}
          {entries !== null && entries.length === 0 && (
            <div className="switcher-empty">No prompts found for this session.</div>
          )}
          {groups.map((g) => (
            <div className="session-timeline-group" key={g.day}>
              <div className="session-timeline-day">{g.day}</div>
              {g.items.map((it, i) => (
                <div className="session-timeline-row" key={i}>
                  <span className="session-timeline-time">{fmtTime(it.time)}</span>
                  <span className="session-timeline-text">{it.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SessionTimeline;
