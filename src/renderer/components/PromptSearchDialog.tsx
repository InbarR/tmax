import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
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
    setSelectedIndex(0);
    setEntries([]);
    setSqliteResults(null);
    setLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    const api = window.terminalAPI as any;
    const allSessions: Array<{ sess: CopilotSessionSummary; provider: 'copilot' | 'claude-code' }> = [
      ...claudeCodeSessions.map((s) => ({ sess: s, provider: 'claude-code' as const })),
      ...copilotSessions.map((s) => ({ sess: s, provider: 'copilot' as const })),
    ];
    if (allSessions.length === 0) { setLoading(false); return; }

    let cancelled = false;
    let outstanding = allSessions.length;
    const finishOne = () => {
      outstanding--;
      if (outstanding === 0 && !cancelled) setLoading(false);
    };

    for (const { sess, provider } of allSessions) {
      const fetcher = provider === 'claude-code' ? api.getClaudeCodePrompts : api.getCopilotPrompts;
      fetcher(sess.id)
        .then((prompts: string[] | undefined) => {
          if (cancelled) return;
          const list = Array.isArray(prompts) ? prompts : [];
          let terminalId: string | null = null;
          let paneTitle = sess.summary || sess.id.slice(0, 8);
          for (const [tid, t] of terminals) {
            if (t.aiSessionId === sess.id) {
              terminalId = tid;
              paneTitle = t.title || paneTitle;
              break;
            }
          }
          const baseTime = sess.lastActivityTime || sess.latestPromptTime || Date.now();
          const sessionEntries: SearchEntry[] = list
            .map((p, i) => ({
              sessionId: sess.id,
              provider,
              promptIndex: i,
              prompt: p,
              terminalId,
              paneTitle,
              sessionFolder: shortPath(sess.cwd || ''),
              sessionCwd: sess.cwd || '',
              ageMs: Math.max(0, Date.now() - baseTime) + (list.length - i - 1) * 1000,
            }))
            .filter((e) => !isTrivial(e.prompt));
          if (sessionEntries.length === 0) return;
          setEntries((prev) => {
            const merged = prev.concat(sessionEntries);
            merged.sort((a, b) => a.ageMs - b.ageMs);
            return merged;
          });
        })
        .catch(() => { /* ignore per-session failures */ })
        .finally(finishOne);
    }

    return () => { cancelled = true; };
  }, [show]);

  // When SQLite is active and user types a query, search the DB directly
  // instead of filtering the initial entries client-side.
  const sqliteActive = useTerminalStore((s) => s.copilotSqliteActive);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sqliteResults, setSqliteResults] = useState<SearchEntry[] | null>(null);

  // Version counter to discard stale SQLite results
  const searchVersionRef = useRef(0);

  useEffect(() => {
    if (!show || !sqliteActive) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    // Clear stale results immediately so client-side filtering takes over while waiting
    setSqliteResults(null);

    // Need 4+ chars for SQLite search (LIKE is a full table scan, short queries are too broad)
    if (!query.trim() || query.trim().length < 4) {
      return;
    }

    const version = ++searchVersionRef.current;
    searchDebounceRef.current = setTimeout(() => {
      const api = window.terminalAPI as any;
      api.searchCopilotPrompts?.(query)?.then((rows: any[] | null) => {
        // Discard if a newer search was initiated
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
          results.push({
            sessionId: row.session_id,
            provider: 'copilot',
            promptIndex: 0,
            prompt,
            terminalId,
            paneTitle,
            sessionFolder: shortPath(row.cwd || ''),
            sessionCwd: row.cwd || '',
            ageMs: Math.max(0, Date.now() - ts),
          });
        }
        results.sort((a, b) => a.ageMs - b.ageMs);
        setSqliteResults(results);
      }).catch(() => {
        if (searchVersionRef.current === version) setSqliteResults(null);
      });
    }, 600);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [query, show, sqliteActive]);

  const filtered = useMemo(() => {
    // When SQLite returned results for the current query, use those
    if (sqliteResults !== null) {
      // Merge SQLite Copilot results with client-side filtered Claude Code entries
      const q = query.toLowerCase();
      const claudeEntries = entries
        .filter((e) => e.provider === 'claude-code')
        .filter((e) =>
          e.prompt.toLowerCase().includes(q) ||
          e.paneTitle.toLowerCase().includes(q) ||
          e.sessionFolder.toLowerCase().includes(q),
        );
      return [...sqliteResults, ...claudeEntries].sort((a, b) => a.ageMs - b.ageMs).slice(0, 200);
    }
    // Otherwise fall back to client-side filtering of loaded entries
    if (!query.trim()) return entries.slice(0, 200);
    const q = query.toLowerCase();
    return entries
      .filter((e) =>
        e.prompt.toLowerCase().includes(q) ||
        e.paneTitle.toLowerCase().includes(q) ||
        e.sessionFolder.toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [entries, query, sqliteResults]);

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

  const hl = (text: string): React.ReactNode => {
    if (!query.trim()) return text;
    const q = query.toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="prompt-search-mark">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div className="switcher-backdrop" onClick={close}>
      <div className="switcher prompt-search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="switcher-input"
          type="text"
          placeholder={sqliteActive ? "Search all AI prompts... (AND, OR supported)" : "Search your AI prompts to jump to that pane..."}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
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
