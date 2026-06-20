import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTerminalStore } from '../state/terminal-store';
import { findSessionById } from '../state/terminal-store';

interface Msg { role: 'user' | 'assistant'; text: string; time: number }

// Render assistant messages as Markdown (sanitized). User prompts stay plain
// text so simple input isn't over-formatted.
function renderMd(text: string): string {
  const html = marked(text, { breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'img'],
    FORBID_ATTR: ['style', 'srcset'],
  });
}

function copyText(text: string): void {
  try {
    (window.terminalAPI as any).clipboardWrite?.(text);
  } catch { /* ignore */ }
  try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
}

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
 * focus: click a different pane and it switches to that session. Both sides
 * are shown for Claude Code and Copilot (a Copilot turn that only ran tools
 * with no written reply simply has nothing to display - no banner, since
 * that gap is rare and an always-on note just reads as noise).
 * Live-refreshes while open. Opened from the AI pane's title-bar button.
 *
 * Width is drag-resizable via the handle on the panel's left edge (persisted
 * to localStorage). The search bar (🔍 / Ctrl+F while focused) finds messages
 * and jumps the body to each hit.
 */
const TranscriptPanel: React.FC = () => {
  const open = useTerminalStore((s) => s.transcriptOpen);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  // A pinned session (from the AI Sessions list) wins over follow-focus.
  const pinnedSessionId = useTerminalStore((s) => s.transcriptSessionId);
  const focusedAiSessionId = useTerminalStore((s) => (focusedId ? s.terminals.get(focusedId)?.aiSessionId : undefined));
  const aiSessionId = pinnedSessionId ?? focusedAiSessionId;
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);
  const width = useTerminalStore((s) => s.transcriptWidth);

  // Clear the pin when the user deliberately focuses a different pane, so the
  // panel resumes following focus. Skip the initial mount (prev === current).
  const prevFocusedRef = useRef(focusedId);
  useEffect(() => {
    if (prevFocusedRef.current !== focusedId) {
      prevFocusedRef.current = focusedId;
      if (useTerminalStore.getState().transcriptSessionId) {
        useTerminalStore.setState({ transcriptSessionId: null });
      }
    }
  }, [focusedId]);

  const sess = useMemo(
    () => (aiSessionId ? findSessionById(copilotSessions, claudeCodeSessions, aiSessionId) : null),
    [aiSessionId, copilotSessions, claudeCodeSessions],
  );
  const provider: 'copilot' | 'claude-code' = sess?.provider === 'claude-code' ? 'claude-code' : 'copilot';
  const title = sess?.summary || (aiSessionId ? aiSessionId.slice(0, 8) : '');

  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<string>('');
  // Tracks which session id has had its initial scroll-to-bottom done. We jump
  // to the latest message the first time a session's messages land in the DOM,
  // so opening the transcript on a long chat doesn't dump you at the very top.
  const initialScrolledForRef = useRef<string | null>(null);
  const close = useCallback(() => useTerminalStore.setState({ transcriptOpen: false }), []);

  // ── Search state ──────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // DOM node per *global* message index, so we can scroll a hit into view.
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // True while a search is positioned on a match, so the live poll's
  // auto-scroll-to-bottom doesn't yank the view away from the hit.
  const searchActiveRef = useRef(false);

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
    initialScrolledForRef.current = null;
    setMsgs(null);

    const fetchOnce = (initial: boolean) => {
      (window.terminalAPI as any).getSessionTimeline(provider, aiSessionId)
        .then((rows: Msg[]) => {
          if (cancelled) return;
          const next = Array.isArray(rows) ? rows : [];
          const nextSig = sig(next);
          if (!initial && nextSig === sigRef.current) return;
          // Don't clobber an in-progress text selection. A live re-render
          // collapses any selection the user is dragging inside the panel,
          // which on an active (streaming) session feels like "can't select
          // to copy". Skip this round; sigRef is left stale so the next poll
          // re-applies once the selection is released.
          if (!initial) {
            const seln = window.getSelection?.();
            if (seln && !seln.isCollapsed && seln.anchorNode &&
                panelRef.current?.contains(seln.anchorNode)) {
              return;
            }
          }
          const wasAtBottom = atBottom();
          sigRef.current = nextSig;
          setMsgs(next);
          // On live updates, keep glueing to the bottom if the user was already
          // there. The *initial* scroll-to-bottom is handled by the layout
          // effect below, because at this point the new bubbles haven't been
          // laid out yet and scrollHeight is still ~0 (which lands at the top).
          if (!initial && wasAtBottom && !searchActiveRef.current) scrollToBottom();
        })
        .catch(() => { if (!cancelled && initial) setMsgs([]); });
    };

    fetchOnce(true);
    const timer = setInterval(() => fetchOnce(false), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open, aiSessionId, provider]);

  // First-render jump: when a session's messages first hit the DOM, scroll the
  // body to the bottom so opening the transcript on a long conversation lands
  // on the most recent message instead of the very first one.
  useLayoutEffect(() => {
    if (!open || !aiSessionId || !msgs || msgs.length === 0) return;
    if (initialScrolledForRef.current === aiSessionId) return;
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
    initialScrolledForRef.current = aiSessionId;
  }, [open, aiSessionId, msgs]);

  // Escape: close the search bar first if it's open, otherwise close the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (searchOpen) { setSearchOpen(false); setQuery(''); }
        else close();
        return;
      }
      // Ctrl/Cmd+F opens the transcript search. The panel is read-only so the
      // terminal keeps DOM focus - we can't gate on focus being inside the
      // panel (it never is). Instead this listener only exists while the
      // transcript is open (see effect guard), and we only act when there's a
      // session to search, so it doesn't hijack the terminal's Ctrl+F at other
      // times. Closing the transcript hands Ctrl+F straight back to the pane.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && aiSessionId) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close, searchOpen, aiSessionId]);

  // Reset transient state when the focused session changes.
  useEffect(() => { setSearchOpen(false); setQuery(''); }, [aiSessionId]);
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);

  const groups = useMemo(() => {
    const out: { day: string; items: { m: Msg; gi: number }[] }[] = [];
    let gi = 0;
    for (const m of msgs ?? []) {
      const day = fmtDay(m.time);
      let g = out[out.length - 1];
      if (!g || g.day !== day) { g = { day, items: [] }; out.push(g); }
      g.items.push({ m, gi });
      gi++;
    }
    return out;
  }, [msgs]);

  // Global indices of messages whose text contains the query (case-insensitive).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !msgs) return [] as number[];
    const res: number[] = [];
    msgs.forEach((m, i) => { if (m.text.toLowerCase().includes(q)) res.push(i); });
    return res;
  }, [query, msgs]);
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Keep the current match in range; reset to the first hit on a new query.
  useEffect(() => { setMatchIdx(0); }, [query]);
  const safeMatchIdx = matches.length ? Math.min(matchIdx, matches.length - 1) : 0;

  // Jump the body to the active match. Depends on the match position + query so
  // it fires on navigation, not on every 2s poll (same-length result is a no-op).
  // matchIdx is included so navigating wraps re-fire even at the same clamped
  // index. We scroll the transcript-body container directly (rather than
  // scrollIntoView, which can pick the wrong scrollable ancestor) and center
  // the hit using rects so nesting in day-groups doesn't throw off the math.
  useEffect(() => {
    searchActiveRef.current = searchOpen && matches.length > 0;
    if (!matches.length) return;
    const el = msgRefs.current.get(matches[safeMatchIdx]);
    const body = bodyRef.current;
    if (!el || !body) return;
    const elRect = el.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const delta = elRect.top - bodyRect.top - (body.clientHeight - el.clientHeight) / 2;
    body.scrollTo({ top: body.scrollTop + delta, behavior: 'smooth' });
  }, [safeMatchIdx, matchIdx, query, matches.length, searchOpen]);

  const gotoMatch = useCallback((delta: number) => {
    setMatchIdx((cur) => {
      if (!matches.length) return 0;
      return (cur + delta + matches.length) % matches.length;
    });
  }, [matches.length]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); }
  };

  // ── Resize: drag the left-edge handle to set the docked width ──────
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = useTerminalStore.getState().transcriptWidth;
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      // Panel is docked on the right, so dragging left (negative delta) widens it.
      useTerminalStore.getState().setTranscriptWidth(startWidth + (startX - ev.clientX));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  if (!open) return null;

  const isCopilot = provider === 'copilot';
  const activeMatchGi = matches.length ? matches[safeMatchIdx] : -1;

  return (
    <div
      ref={panelRef}
      className={`transcript-panel${isCopilot ? ' copilot' : ''}`}
      style={{ width }}
      // Focusable so a click inside makes the panel the activeElement. Without
      // this, clicking a (non-focusable) bubble sends focus to <body>, and the
      // focused terminal's blur handler reads that as "nobody took focus" and
      // refocuses xterm - which collapses the text selection you're dragging.
      tabIndex={-1}
    >
      <div
        className="transcript-resizer"
        onMouseDown={onResizeDown}
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
      />
      <div className="transcript-header">
        <div className="transcript-titles">
          <span className="transcript-title">{title || 'Transcript'}</span>
          <span className="transcript-sub">
            {aiSessionId ? (isCopilot ? 'Copilot' : 'Claude Code') : 'No AI session in focused pane'}
            {aiSessionId && msgs ? ` · ${msgs.length} message${msgs.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        {aiSessionId && (
          <button
            className={`transcript-search-toggle${searchOpen ? ' active' : ''}`}
            onClick={() => setSearchOpen((v) => !v)}
            title="Search transcript (Ctrl+F)"
            aria-label="Search transcript"
          >&#128269;</button>
        )}
        <button className="transcript-close" onClick={close} title="Close (Esc)" aria-label="Close">&#10005;</button>
      </div>
      {aiSessionId && searchOpen && (
        <div className="transcript-search">
          <input
            ref={searchInputRef}
            className="transcript-search-input"
            value={query}
            placeholder="Find in transcript…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          <span className="transcript-search-count">
            {query.trim() ? (matches.length ? `${safeMatchIdx + 1}/${matches.length}` : '0/0') : ''}
          </span>
          <button className="transcript-search-nav" onClick={() => gotoMatch(-1)} disabled={!matches.length} title="Previous match (Shift+Enter)" aria-label="Previous match">&#8593;</button>
          <button className="transcript-search-nav" onClick={() => gotoMatch(1)} disabled={!matches.length} title="Next match (Enter)" aria-label="Next match">&#8595;</button>
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
        {query.trim() && msgs && matches.length === 0 && (
          <div className="transcript-empty">No messages match “{query.trim()}”.</div>
        )}
        {groups.map((g) => (
          <div className="transcript-group" key={g.day}>
            <div className="transcript-day">{g.day}</div>
            {g.items.map(({ m, gi }) => {
              const isHit = matchSet.has(gi);
              const isActive = gi === activeMatchGi;
              return (
                <div
                  className={`transcript-msg ${m.role}${isHit ? ' search-hit' : ''}${isActive ? ' search-active' : ''}`}
                  key={gi}
                  ref={(el) => { if (el) msgRefs.current.set(gi, el); else msgRefs.current.delete(gi); }}
                  onContextMenu={(e) => {
                    // Right-click copies your current selection, or the whole
                    // message if nothing is selected.
                    e.preventDefault();
                    const sel = window.getSelection?.()?.toString();
                    copyText(sel && sel.trim() ? sel : m.text);
                    useTerminalStore.getState().addToast('Copied to clipboard');
                  }}
                >
                  {m.role === 'assistant' && (
                    <div className="transcript-msg-agent">{isCopilot ? 'Copilot' : 'Claude Code'}</div>
                  )}
                  {m.role === 'assistant'
                    ? <div className="transcript-bubble md" dangerouslySetInnerHTML={{ __html: renderMd(m.text) }} />
                    : <div className="transcript-bubble">{m.text}</div>}
                  <div className="transcript-metarow">
                    <span className="transcript-time">{fmtTime(m.time)}</span>
                    <button className="transcript-copy" title="Copy message" aria-label="Copy message"
                      onClick={() => copyText(m.text)}>&#10697;</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptPanel;
