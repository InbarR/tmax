import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { tokenizeAnd, matchesAllTokens } from '../../shared/and-filter';
import type { CopilotSessionSummary } from '../../shared/copilot-types';

interface SearchEntry {
  sessionId: string;
  provider: 'copilot' | 'claude-code';
  promptIndex: number;
  prompt: string;
  terminalId: string | null;
  paneTitle: string;
  sessionFolder: string;
  /** Full cwd of the session - used as fallback to spawn a new pane there
   *  when the session has no live in-window pane and the live store entry
   *  is missing (otherwise SessionSummary would render null). */
  sessionCwd: string;
  ageMs: number;
  /** Lowercased `prompt\npaneTitle\nsessionFolder`, precomputed once so
   *  per-keystroke filtering doesn't rebuild + lowercase it every time. */
  haystack: string;
}

function shortPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

function relativePhrase(ms: number): string {
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const TRIVIAL_ACKS = new Set([
  'k', 'ok', 'okay', 'yes', 'no', 'sure', 'go', 'do it', 'thanks', 'thx',
  'continue', 'cont', 'go on', 'next', 'ship it', 'great', 'good', 'lgtm',
  'looks good', 'yep', 'nope', 'right', 'correct',
]);

function isTrivial(p: string): boolean {
  const trimmed = p.trim().toLowerCase();
  if (trimmed.length < 4) return true;
  return TRIVIAL_ACKS.has(trimmed);
}

const PromptSearchDialog: React.FC = () => {
  const show = useTerminalStore((s) => s.showPromptSearch);
  const close = useCallback(() => {
    useTerminalStore.getState().togglePromptSearch();
  }, []);

  const [query, setQuery] = useState('');
  // Debounced copy of `query` that drives all the expensive work (tokenizing,
  // SQLite search, client-side filtering, highlighting). The input itself
  // binds to `query` so typing stays instant, while the heavy list only
  // recomputes when `filterQuery` catches up. Keeping a single derived query
  // (rather than useDeferredValue) guarantees the result count and the
  // rendered rows are always computed from the same value - otherwise frequent
  // store-driven re-renders can leave stale rows showing under a "0 results"
  // count (TASK-185).
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pull the session lists and terminals up front so we can build entries
  // from them once prompts arrive.
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const terminals = useTerminalStore((s) => s.terminals);

  // Reset and fetch when opening. Uses file-based prompt loading for the
  // initial view (loaded sessions only — fast). SQLite search is triggered
  // separately when the user types a query (see debounced search below).
  useEffect(() => {
    if (!show) return;
    setQuery('');
    setFilterQuery('');
    setSelectedIndex(0);
    setEntries([]);
    setSqliteResults(null);
    setLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    const api = window.terminalAPI as any;
    // TASK-259: when SQLite is active, copilot prompts come from ONE indexed DB
    // query (below), NOT by reading every session's events.jsonl. Reading ~1500
    // files synchronously in the main process froze the app. Claude Code isn't
    // in that DB, so it always uses the per-session file path.
    const sqliteOn = useTerminalStore.getState().copilotSqliteActive === true;
    const allSessions: Array<{ sess: CopilotSessionSummary; provider: 'copilot' | 'claude-code' }> = [
      ...claudeCodeSessions.map((s) => ({ sess: s, provider: 'claude-code' as const })),
      ...(sqliteOn ? [] : copilotSessions.map((s) => ({ sess: s, provider: 'copilot' as const }))),
    ];
    if (allSessions.length === 0 && !sqliteOn) { setLoading(false); return; }

    let cancelled = false;

    // Build search entries for one session's prompts.
    const buildEntries = (
      sess: CopilotSessionSummary,
      provider: 'copilot' | 'claude-code',
      prompts: string[] | undefined,
    ): SearchEntry[] => {
      const list = Array.isArray(prompts) ? prompts : [];
      let terminalId: string | null = null;
      let paneTitle = sess.summary || sess.id.slice(0, 8);
      for (const [tid, t] of terminals) {
        if (t.aiSessionId === sess.id) { terminalId = tid; paneTitle = t.title || paneTitle; break; }
      }
      const baseTime = sess.lastActivityTime || sess.latestPromptTime || Date.now();
      const sessionFolder = shortPath(sess.cwd || '');
      return list
        .map((p, i) => ({
          sessionId: sess.id,
          provider,
          promptIndex: i,
          prompt: p,
          terminalId,
          paneTitle,
          sessionFolder,
          sessionCwd: sess.cwd || '',
          ageMs: Math.max(0, Date.now() - baseTime) + (list.length - i - 1) * 1000,
          haystack: `${p}\n${paneTitle}\n${sessionFolder}`.toLowerCase(),
        }))
        .filter((e) => !isTrivial(e.prompt));
    };

    // TASK-259: firing one prompt-file-read IPC per session for ALL (~1500)
    // sessions at once floods the main process, and re-sorting the growing
    // result array on every resolution is O(N^2) - together they froze the app.
    // Load with a bounded worker pool and flush state on a throttle instead.
    const acc: SearchEntry[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (cancelled) return;
      setEntries(acc.slice().sort((a, b) => a.ageMs - b.ageMs));
    };
    const scheduleFlush = () => { if (!flushTimer && !cancelled) flushTimer = setTimeout(flush, 100); };

    let nextIdx = 0;
    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const i = nextIdx++;
        if (i >= allSessions.length) return;
        const { sess, provider } = allSessions[i];
        const fetcher = provider === 'claude-code' ? api.getClaudeCodePrompts : api.getCopilotPrompts;
        try {
          const prompts = await fetcher(sess.id);
          if (cancelled) return;
          const entries = buildEntries(sess, provider, prompts);
          if (entries.length) { acc.push(...entries); scheduleFlush(); }
        } catch { /* ignore per-session failures */ }
      }
    };
    const CONCURRENCY = 8;
    const poolDone = Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, allSessions.length) }, () => worker()),
    );

    // Copilot browse set straight from the DB (one indexed query) when SQLite
    // is active - replaces ~1500 events.jsonl file reads (TASK-259).
    const dbDone: Promise<unknown> = sqliteOn
      ? (async () => {
          try {
            const rows = await api.getCopilotRecentPrompts(300);
            if (cancelled || !Array.isArray(rows)) return;
            const dbEntries: SearchEntry[] = rows
              .map((r: { session_id: string; user_message: string; timestamp: string; summary?: string; cwd?: string }) => {
                let terminalId: string | null = null;
                let paneTitle = r.summary || r.session_id.slice(0, 8);
                for (const [tid, t] of terminals) {
                  if (t.aiSessionId === r.session_id) { terminalId = tid; paneTitle = t.title || paneTitle; break; }
                }
                const folder = shortPath(r.cwd || '');
                const time = Date.parse(r.timestamp) || Date.now();
                return {
                  sessionId: r.session_id,
                  provider: 'copilot' as const,
                  promptIndex: 0,
                  prompt: r.user_message,
                  terminalId,
                  paneTitle,
                  sessionFolder: folder,
                  sessionCwd: r.cwd || '',
                  ageMs: Math.max(0, Date.now() - time),
                  haystack: `${r.user_message}\n${paneTitle}\n${folder}`.toLowerCase(),
                };
              })
              .filter((e: SearchEntry) => !isTrivial(e.prompt));
            if (dbEntries.length) { acc.push(...dbEntries); scheduleFlush(); }
          } catch { /* ignore - browse set just stays file/empty */ }
        })()
      : Promise.resolve();

    Promise.all([poolDone, dbDone]).finally(() => {
      if (cancelled) return;
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      setLoading(false);
    });

    return () => { cancelled = true; if (flushTimer) clearTimeout(flushTimer); };
  }, [show]);

  // Tokenize the query on whole-word case-insensitive 'AND' for client-side
  // filtering of non-SQLite results (Claude Code, fresh installs, fallback).
  // SQLite FTS5 handles AND/OR natively when the user is on the DB path.
  //
  // Debounce query -> filterQuery so filtering/highlighting lag the keystrokes
  // slightly instead of running on every one. ~120ms is below the threshold of
  // feeling laggy while still collapsing bursts of fast typing.
  useEffect(() => {
    const id = setTimeout(() => setFilterQuery(query), 120);
    return () => clearTimeout(id);
  }, [query]);
  const tokens = useMemo(() => tokenizeAnd(filterQuery), [filterQuery]);
  const matchesAll = useCallback(
    (haystack: string) => matchesAllTokens(haystack, tokens),
    [tokens],
  );

  // When SQLite is active and the user types a query, search the DB directly
  // instead of filtering only the initial in-memory entries client-side.
  const sqliteActive = useTerminalStore((s) => s.copilotSqliteActive);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sqliteResults, setSqliteResults] = useState<SearchEntry[] | null>(null);
  const searchVersionRef = useRef(0);

  useEffect(() => {
    if (!show || !sqliteActive) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    // Clear stale results immediately so client-side filtering takes over while waiting
    setSqliteResults(null);

    // Need 4+ chars for SQLite search (LIKE is a full table scan, short queries are too broad)
    if (!filterQuery.trim() || filterQuery.trim().length < 4) {
      return;
    }

    const version = ++searchVersionRef.current;
    searchDebounceRef.current = setTimeout(() => {
      const api = window.terminalAPI as any;
      api.searchCopilotPrompts?.(filterQuery)?.then((rows: any[] | null) => {
        if (searchVersionRef.current !== version) return;
        if (!rows) { setSqliteResults(null); return; }
        const results: SearchEntry[] = [];
        for (const row of rows) {
          const prompt = (row.user_message || '').slice(0, 300);
          if (isTrivial(prompt)) continue;
          let terminalId: string | null = null;
          let paneTitle = row.summary || row.session_id.slice(0, 8);
          for (const [tid, t] of terminals) {
            if (t.aiSessionId === row.session_id) {
              terminalId = tid;
              paneTitle = t.title || paneTitle;
              break;
            }
          }
          const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
          const sessionFolder = shortPath(row.cwd || '');
          results.push({
            sessionId: row.session_id,
            provider: 'copilot',
            promptIndex: 0,
            prompt,
            terminalId,
            paneTitle,
            sessionFolder,
            sessionCwd: row.cwd || '',
            ageMs: Math.max(0, Date.now() - ts),
            haystack: `${prompt}\n${paneTitle}\n${sessionFolder}`.toLowerCase(),
          });
        }
        results.sort((a, b) => a.ageMs - b.ageMs);
        setSqliteResults(results);
      }).catch(() => {
        if (searchVersionRef.current === version) setSqliteResults(null);
      });
    }, 600);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [filterQuery, show, sqliteActive]);

  // Combined match list: SQLite Copilot results blended with client-side
  // AND-filtered Claude Code entries when SQLite is active. Otherwise, client-
  // side AND-filter across all loaded entries.
  const allMatches = useMemo(() => {
    if (sqliteResults !== null) {
      const claudeEntries = entries
        .filter((e) => e.provider === 'claude-code')
        .filter((e) => matchesAll(e.haystack));
      return [...sqliteResults, ...claudeEntries].sort((a, b) => a.ageMs - b.ageMs);
    }
    if (tokens.length === 0) return entries;
    return entries.filter((e) => matchesAll(e.haystack));
  }, [entries, sqliteResults, tokens, matchesAll]);

  const filtered = useMemo(() => allMatches.slice(0, 200), [allMatches]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const jumpTo = useCallback((entry: SearchEntry) => {
    if (entry.terminalId) {
      // If the linked pane lives in a different workspace, switch to that
      // workspace first - otherwise setFocus changes focusedTerminalId but
      // the user is still looking at the wrong workspace's grid (TASK-92).
      const state = useTerminalStore.getState();
      const targetTerm = state.terminals.get(entry.terminalId);
      const targetWsId = targetTerm?.workspaceId;
      if (targetWsId && targetWsId !== state.activeWorkspaceId) {
        state.setActiveWorkspace(targetWsId);
      }
      state.setFocus(entry.terminalId);
      close();
      return;
    }
    // No linked pane in this window. Resume the AI session in a new pane -
    // same flow as clicking Resume on the AI sessions sidebar (TASK-91).
    // openAiSession spawns a pane with `<provider> --resume <sessionId>` as
    // startup command. If the session isn't in main's in-memory list (cross-
    // window edge case), the resume IPC returns null and openAiSession
    // bails; in that case we still want to do SOMETHING visible, so fall
    // back to a plain pane in the session's cwd (TASK-86 behavior).
    const state = useTerminalStore.getState();
    const liveSession =
      state.claudeCodeSessions.find((x) => x.id === entry.sessionId) ||
      state.copilotSessions.find((x) => x.id === entry.sessionId) ||
      null;
    if (liveSession) {
      if (entry.provider === 'claude-code') {
        void state.openClaudeCodeSession(entry.sessionId);
      } else {
        void state.openCopilotSession(entry.sessionId);
      }
    } else if (entry.sessionCwd) {
      void state.createTerminal(undefined, entry.sessionCwd);
    } else {
      console.warn('[tmax] prompt search: no terminal, no live session, no cwd', entry.sessionId);
    }
    close();
  }, [close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) jumpTo(filtered[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
    e.stopPropagation();
  }, [filtered, selectedIndex, jumpTo, close]);

  if (!show) return null;

  // Highlight each AND-separated token independently so the user can see
  // which words actually matched. Falls back to the full query as a single
  // span when no tokens (legacy substring path).
  const hl = (text: string): React.ReactNode => {
    if (tokens.length === 0) return text;
    const lower = text.toLowerCase();
    type Span = { start: number; end: number };
    const spans: Span[] = [];
    for (const { term, negate } of tokens) {
      if (negate) continue; // don't highlight excluded (NOT) terms
      let from = 0;
      while (from < text.length) {
        const idx = lower.indexOf(term, from);
        if (idx < 0) break;
        spans.push({ start: idx, end: idx + term.length });
        from = idx + term.length;
      }
    }
    if (spans.length === 0) return text;
    spans.sort((a, b) => a.start - b.start);
    const merged: Span[] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
      else merged.push({ ...s });
    }
    const out: React.ReactNode[] = [];
    let cursor = 0;
    merged.forEach((s, i) => {
      if (s.start > cursor) out.push(text.slice(cursor, s.start));
      out.push(<mark key={i} className="prompt-search-mark">{text.slice(s.start, s.end)}</mark>);
      cursor = s.end;
    });
    if (cursor < text.length) out.push(text.slice(cursor));
    return <>{out}</>;
  };

  return (
    <div className="switcher-backdrop" onClick={close}>
      <div className="switcher prompt-search" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-search-input-row">
          <input
            ref={inputRef}
            className="switcher-input"
            type="text"
            placeholder={sqliteActive ? "Search all AI prompts (AND / OR / NOT supported)..." : "Search prompts (use AND / NOT to combine terms)..."}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          {entries.length > 0 && (
            <span className="prompt-search-count" aria-live="polite">
              {allMatches.length === entries.length
                ? `${entries.length}`
                : `${allMatches.length} of ${entries.length}`}
              {allMatches.length > filtered.length ? ` (showing ${filtered.length})` : ''}
            </span>
          )}
        </div>
        <div className="switcher-list">
          {loading && entries.length === 0 && (
            <div className="switcher-empty">Loading prompts...</div>
          )}
          {!loading && entries.length === 0 && (
            <div className="switcher-empty">No AI prompts found yet.</div>
          )}
          {filtered.map((entry, index) => {
            const key = `${entry.sessionId}-${entry.promptIndex}`;
            // Jump glyph telegraphs that the row is clickable. Live pane gets
            // a forward-arrow ('jump to pane'); inactive session gets an
            // upward arrow that hints at the summary popover (TASK-84).
            const jumpGlyph = entry.terminalId ? '↗' : '↑';
            const jumpHint = entry.terminalId ? 'Jump to this pane' : 'Open session summary';
            return (
              <div
                key={key}
                className={`switcher-item prompt-search-item${index === selectedIndex ? ' selected' : ''}${entry.terminalId ? '' : ' prompt-search-orphan'}`}
                onClick={() => jumpTo(entry)}
                onMouseEnter={() => setSelectedIndex(index)}
                title={`${jumpHint} (Enter)`}
              >
                <div className="prompt-search-row">
                  <div className="prompt-search-body">
                    <div className="prompt-search-prompt">{hl(entry.prompt)}</div>
                    <div className="prompt-search-meta">
                      <span className="prompt-search-pane">
                        <span className="prompt-search-meta-label">title:</span> {hl(entry.paneTitle)}
                      </span>
                      {entry.sessionFolder && (
                        <span className="prompt-search-folder">
                          <span className="prompt-search-meta-label">folder:</span> {hl(entry.sessionFolder)}
                        </span>
                      )}
                      <span className="prompt-search-age">{relativePhrase(entry.ageMs)}</span>
                    </div>
                  </div>
                  <span className="prompt-search-jump" aria-hidden="true" title={jumpHint}>{jumpGlyph}</span>
                </div>
              </div>
            );
          })}
          {!loading && entries.length > 0 && filtered.length === 0 && (
            <div className="switcher-empty">No prompts match "{query}".</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptSearchDialog;
