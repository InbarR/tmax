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

  // Reset and fetch when opening. Each open re-fetches because new prompts
  // may have arrived since last open.
  useEffect(() => {
    if (!show) return;
    setQuery('');
    setSelectedIndex(0);
    setLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    const api = window.terminalAPI as any;
    const buildEntries = (sessions: CopilotSessionSummary[], provider: 'copilot' | 'claude-code'): Promise<SearchEntry[]> => {
      const fetcher = provider === 'claude-code' ? api.getClaudeCodePrompts : api.getCopilotPrompts;
      return Promise.all(
        sessions.map(async (sess) => {
          let prompts: string[] = [];
          try {
            prompts = await fetcher(sess.id);
            if (!Array.isArray(prompts)) prompts = [];
          } catch { /* ignore */ }
          // Find the linked pane by aiSessionId. Cross-window panes won't
          // be in this map but the dialog can still surface the prompt -
          // jump will simply have no target.
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
          return prompts.map((p, i) => ({
            sessionId: sess.id,
            provider,
            promptIndex: i,
            prompt: p,
            terminalId,
            paneTitle,
            sessionFolder: shortPath(sess.cwd || ''),
            // Newer prompts within a session get a smaller age. Without
            // per-prompt timestamps the best we can do is gradient from
            // baseTime down so newest-in-session sorts first.
            ageMs: Math.max(0, Date.now() - baseTime) + (prompts.length - i - 1) * 1000,
          }));
        }),
      ).then((arrs) => arrs.flat());
    };

    Promise.all([
      buildEntries(claudeCodeSessions, 'claude-code'),
      buildEntries(copilotSessions, 'copilot'),
    ])
      .then(([cc, cp]) => {
        const all = [...cc, ...cp].filter((e) => !isTrivial(e.prompt));
        // Sort newest first
        all.sort((a, b) => a.ageMs - b.ageMs);
        setEntries(all);
      })
      .finally(() => setLoading(false));
  }, [show]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 200);
    const q = query.toLowerCase();
    return entries
      .filter((e) =>
        e.prompt.toLowerCase().includes(q) ||
        e.paneTitle.toLowerCase().includes(q) ||
        e.sessionFolder.toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [entries, query]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const jumpTo = useCallback((entry: SearchEntry) => {
    if (entry.terminalId) {
      useTerminalStore.getState().setFocus(entry.terminalId);
    } else {
      // No linked pane in this window - fall back to opening the session
      // summary so the user at least sees the conversation.
      useTerminalStore.getState().showSessionSummary(entry.sessionId);
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
          placeholder="Search your AI prompts to jump to that pane..."
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
            return (
              <div
                key={key}
                className={`switcher-item prompt-search-item${index === selectedIndex ? ' selected' : ''}${entry.terminalId ? '' : ' prompt-search-orphan'}`}
                onClick={() => jumpTo(entry)}
                onMouseEnter={() => setSelectedIndex(index)}
                title={entry.terminalId ? 'Jump to this pane' : 'No pane in this window for this session - opens session summary'}
              >
                <div className="prompt-search-prompt">{hl(entry.prompt)}</div>
                <div className="prompt-search-meta">
                  <span className="prompt-search-pane">
                    {entry.terminalId ? '🪟' : '💤'} {hl(entry.paneTitle)}
                  </span>
                  {entry.sessionFolder && (
                    <span className="prompt-search-folder">📁 {hl(entry.sessionFolder)}</span>
                  )}
                  <span className="prompt-search-age">{relativePhrase(entry.ageMs)}</span>
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
