import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore } from '../state/terminal-store';
import type { CopilotSessionSummary, CopilotSessionStatus, SessionProvider } from '../../shared/copilot-types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;

const STATUS_COLORS: Record<CopilotSessionStatus, string> = {
  idle: '#a6adc8',
  thinking: '#89b4fa',
  executingTool: '#f9e2af',
  awaitingApproval: '#f38ba8',
  waitingForUser: '#a6e3a1',
};

const STATUS_LABELS: Record<CopilotSessionStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  executingTool: 'Running tool',
  awaitingApproval: 'Needs approval',
  waitingForUser: 'Waiting for input',
};

type FilterTab = 'all' | 'copilot' | 'claude-code';

function isActiveStatus(status: CopilotSessionStatus): boolean {
  return status !== 'idle';
}

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function shortPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

function getTitle(s: CopilotSessionSummary): string {
  if (s.summary) return s.summary;
  if (s.cwd) return shortPath(s.cwd);
  if (s.repository) return shortPath(s.repository);
  return s.id.slice(0, 8);
}

function getSubtitle(s: CopilotSessionSummary): string | null {
  if (s.summary && s.cwd) return shortPath(s.cwd);
  return null;
}

function sortSessions(sessions: CopilotSessionSummary[]): CopilotSessionSummary[] {
  return [...sessions].sort((a, b) => {
    // Active (non-idle) sessions first
    const aActive = a.status !== 'idle' ? 1 : 0;
    const bActive = b.status !== 'idle' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    // Then by last activity (most recent first)
    return (b.lastActivityTime || 0) - (a.lastActivityTime || 0);
  });
}

const PROVIDER_LABEL: Record<SessionProvider, string> = {
  copilot: 'Copilot',
  'claude-code': 'Claude',
};

const CopilotPanel: React.FC = () => {
  const show = useTerminalStore((s) => s.showCopilotPanel);
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);
  const terminals = useTerminalStore((s) => s.terminals);

  // Track which AI session IDs have open terminals
  const openSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [, t] of terminals) {
      if (t.aiSessionId) ids.add(t.aiSessionId);
    }
    return ids;
  }, [terminals]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: CopilotSessionSummary } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; provider: SessionProvider; value: string } | null>(null);
  const [summaryOverrides, setSummaryOverrides] = useState<Record<string, string>>({});
  const [promptsDialog, setPromptsDialog] = useState<{ title: string; prompts: string[] } | null>(null);
  const [showRunningOnly, setShowRunningOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Start/stop watching when panel opens/closes
  useEffect(() => {
    if (!show) return;

    const api = window.terminalAPI as any;
    api.startCopilotWatching?.();
    api.startClaudeCodeWatching?.();
    useTerminalStore.getState().loadCopilotSessions();
    useTerminalStore.getState().loadClaudeCodeSessions();

    const unsubCopilotUpdated = api.onCopilotSessionUpdated?.((session: CopilotSessionSummary) => {
      useTerminalStore.getState().updateCopilotSession(session);
    });
    const unsubCopilotAdded = api.onCopilotSessionAdded?.((session: CopilotSessionSummary) => {
      useTerminalStore.getState().addCopilotSession(session);
    });
    const unsubCopilotRemoved = api.onCopilotSessionRemoved?.((sessionId: string) => {
      useTerminalStore.getState().removeCopilotSession(sessionId);
    });
    const unsubClaudeUpdated = api.onClaudeCodeSessionUpdated?.((session: CopilotSessionSummary) => {
      useTerminalStore.getState().updateClaudeCodeSession(session);
    });
    const unsubClaudeAdded = api.onClaudeCodeSessionAdded?.((session: CopilotSessionSummary) => {
      useTerminalStore.getState().addClaudeCodeSession(session);
    });
    const unsubClaudeRemoved = api.onClaudeCodeSessionRemoved?.((sessionId: string) => {
      useTerminalStore.getState().removeClaudeCodeSession(sessionId);
    });

    return () => {
      api.stopCopilotWatching?.();
      api.stopClaudeCodeWatching?.();
      unsubCopilotUpdated?.();
      unsubCopilotAdded?.();
      unsubCopilotRemoved?.();
      unsubClaudeUpdated?.();
      unsubClaudeAdded?.();
      unsubClaudeRemoved?.();
    };
  }, [show]);

  useEffect(() => {
    if (show) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [show]);

  // Refresh time display every 10s
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!show) return;
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, [show]);

  // Merge, deduplicate, and filter sessions
  const filtered = useMemo(() => {
    let all = [
      ...copilotSessions.map((s) => ({ ...s, provider: s.provider || 'copilot' as const })),
      ...claudeCodeSessions.map((s) => ({ ...s, provider: s.provider || 'claude-code' as const })),
    ].map((s) => summaryOverrides[s.id] ? { ...s, summary: summaryOverrides[s.id] } : s);

    // Filter by provider tab
    if (filterTab !== 'all') {
      all = all.filter((s) => s.provider === filterTab);
    }

    // Filter to running (non-idle) sessions only
    if (showRunningOnly) {
      all = all.filter((s) => s.status !== 'idle');
    }

    // Filter by search query
    if (query.trim()) {
      const q = query.toLowerCase();
      all = all.filter(
        (s) =>
          (s.summary || '').toLowerCase().includes(q) ||
          s.repository.toLowerCase().includes(q) ||
          s.branch.toLowerCase().includes(q) ||
          s.cwd.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }

    // Deduplicate by session ID (primary) and cwd+branch+provider (secondary)
    const byId = new Map<string, CopilotSessionSummary>();
    for (const s of all) {
      const existing = byId.get(s.id);
      if (!existing || (s.lastActivityTime || 0) > (existing.lastActivityTime || 0)) {
        byId.set(s.id, s);
      }
    }
    // Also collapse same cwd+branch+provider to most recent (prefer ones with summaries)
    const byKey = new Map<string, CopilotSessionSummary>();
    for (const s of sortSessions(Array.from(byId.values()))) {
      const key = `${s.provider}|${s.cwd}|${s.branch}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, s);
      } else {
        // Prefer session with summary; if both have or neither has, keep most recent
        const existHasSummary = !!existing.summary;
        const newHasSummary = !!s.summary;
        if ((!existHasSummary && newHasSummary) ||
            (existHasSummary === newHasSummary && (s.lastActivityTime || 0) > (existing.lastActivityTime || 0))) {
          byKey.set(key, s);
        }
      }
    }

    return sortSessions(Array.from(byKey.values()));
  }, [copilotSessions, claudeCodeSessions, query, filterTab, showRunningOnly, summaryOverrides]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.ai-session-item');
      const item = items[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  // Focus rename input
  useEffect(() => {
    if (renaming) requestAnimationFrame(() => renameRef.current?.focus());
  }, [renaming]);

  const handleContextMenu = useCallback((e: React.MouseEvent, session: CopilotSessionSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, session });
  }, []);

  const handleRemoveSession = useCallback((session: CopilotSessionSummary) => {
    if (session.provider === 'claude-code') {
      useTerminalStore.getState().removeClaudeCodeSession(session.id);
    } else {
      useTerminalStore.getState().removeCopilotSession(session.id);
    }
    setCtxMenu(null);
  }, []);

  const handleStartRename = useCallback((session: CopilotSessionSummary) => {
    setRenaming({ id: session.id, provider: session.provider, value: summaryOverrides[session.id] || session.summary || getTitle(session) });
    setCtxMenu(null);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (!renaming) return;
    const newSummary = renaming.value.trim();
    if (newSummary) {
      setSummaryOverrides((prev) => ({ ...prev, [renaming.id]: newSummary }));
    }
    setRenaming(null);
  }, [renaming]);

  const handleShowPrompts = useCallback(async (session: CopilotSessionSummary) => {
    const api = window.terminalAPI as any;
    let prompts: string[];
    if (session.provider === 'claude-code') {
      prompts = await api.getClaudeCodePrompts(session.id);
    } else {
      prompts = await api.getCopilotPrompts(session.id);
    }
    setPromptsDialog({
      title: summaryOverrides[session.id] || session.summary || getTitle(session),
      prompts: prompts.length > 0 ? prompts : ['(no prompts found)'],
    });
    setCtxMenu(null);
  }, [summaryOverrides]);

  const handleRefresh = useCallback(() => {
    const store = useTerminalStore.getState();
    store.loadCopilotSessions();
    store.loadClaudeCodeSessions();
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      setResizing(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + moveEvent.clientX - startX));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [width],
  );

  const openSession = useCallback((session: CopilotSessionSummary) => {
    const store = useTerminalStore.getState();
    if (session.provider === 'claude-code') {
      store.openClaudeCodeSession(session.id);
    } else {
      store.openCopilotSession(session.id);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
          if (filtered[selectedIndex]) {
            openSession(filtered[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          useTerminalStore.getState().toggleCopilotPanel();
          break;
        default:
          return;
      }
      e.stopPropagation();
    },
    [filtered, selectedIndex, openSession],
  );

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    const store = useTerminalStore.getState();
    store.searchCopilotSessions(value);
    store.searchClaudeCodeSessions(value);
  }, []);

  if (!show) return null;

  // Counts for filter tabs (deduplicated)
  const copilotCount = new Set(copilotSessions.map((s) => `${s.cwd}|${s.branch}`)).size;
  const claudeCount = new Set(claudeCodeSessions.map((s) => `${s.cwd}|${s.branch}`)).size;
  const allCount = copilotCount + claudeCount;

  return (
    <div className={`copilot-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="dir-panel-resize" onMouseDown={handleResizeStart} />

      <div className="dir-panel-header">
        <span>AI Sessions</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            className={`ai-session-tab${showRunningOnly ? ' active' : ''}`}
            onClick={() => setShowRunningOnly((v) => !v)}
            title="Show only running sessions"
            style={{ fontSize: '10px', padding: '1px 6px' }}
          >
            Running
          </button>
          <button className="dir-panel-close" onClick={handleRefresh} title="Refresh">&#8635;</button>
          <button className="dir-panel-close" onClick={() => useTerminalStore.getState().toggleCopilotPanel()}>&#10005;</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="ai-session-tabs">
        <button
          className={`ai-session-tab${filterTab === 'all' ? ' active' : ''}`}
          onClick={() => setFilterTab('all')}
        >
          All{allCount > 0 ? ` (${allCount})` : ''}
        </button>
        {copilotCount > 0 && (
          <button
            className={`ai-session-tab${filterTab === 'copilot' ? ' active' : ''}`}
            onClick={() => setFilterTab('copilot')}
          >
            Copilot
          </button>
        )}
        {claudeCount > 0 && (
          <button
            className={`ai-session-tab${filterTab === 'claude-code' ? ' active' : ''}`}
            onClick={() => setFilterTab('claude-code')}
          >
            Claude
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        className="dir-panel-search"
        type="text"
        placeholder="Search sessions..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="dir-panel-list" ref={listRef}>
        {filtered.map((session, index) => {
          const title = getTitle(session);
          const subtitle = getSubtitle(session);
          const active = isActiveStatus(session.status);
          const isOpen = openSessionIds.has(session.id);
          const time = relativeTime(session.lastActivityTime);
          const hasStats = session.messageCount > 0 || session.toolCallCount > 0;

          return (
            <div
              key={`${session.provider}-${session.id}`}
              className={`ai-session-item${index === selectedIndex ? ' selected' : ''}${active ? ' active' : ''}`}
              onClick={() => openSession(session)}
              onMouseEnter={() => setSelectedIndex(index)}
              onContextMenu={(e) => handleContextMenu(e, session)}
              title={session.cwd || session.id}
            >
              <span
                className={`ai-status-dot${active ? ' pulsing' : ''}`}
                style={{ background: STATUS_COLORS[session.status] }}
                title={STATUS_LABELS[session.status]}
              />
              <div className="ai-session-info">
                <div className="ai-session-title-row">
                  {renaming && renaming.id === session.id ? (
                    <input
                      ref={renameRef}
                      className="ai-session-rename-input"
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') handleFinishRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={handleFinishRename}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="ai-session-name" title={title}>
                      {title}
                    </span>
                  )}
                  {isOpen && <span className="ai-open-badge">OPEN</span>}
                  {time && <span className="ai-session-time">{time}</span>}
                </div>
                {subtitle && (
                  <div className="ai-session-subtitle">{subtitle}</div>
                )}
                {session.cwd && (
                  <div className="ai-session-cwd" title={session.cwd}>{session.cwd}</div>
                )}
                {active && (
                  <div className="ai-session-status" style={{ color: STATUS_COLORS[session.status] }}>
                    {STATUS_LABELS[session.status]}
                  </div>
                )}
                <div className="ai-session-meta">
                  <span className="ai-provider-badge" data-provider={session.provider}>
                    {PROVIDER_LABEL[session.provider] || session.provider}
                  </span>
                  {session.branch && (
                    <span className="ai-branch-badge">{session.branch}</span>
                  )}
                  {session.model && (
                    <span className="ai-session-stat">{session.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}</span>
                  )}
                  {hasStats && (
                    <>
                      <span className="ai-session-stat">{session.messageCount} msgs</span>
                      {session.toolCallCount > 0 && (
                        <span className="ai-session-stat">{session.toolCallCount} tools</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="dir-panel-empty">
            {allCount === 0
              ? 'No AI sessions found'
              : 'No matching sessions'}
          </div>
        )}
      </div>

      {promptsDialog && ReactDOM.createPortal(
        <PromptsDialog
          title={promptsDialog.title}
          prompts={promptsDialog.prompts}
          onClose={() => setPromptsDialog(null)}
        />,
        document.body,
      )}

      {ctxMenu && (
        <div ref={ctxRef} className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          <button className="context-menu-item" onClick={() => { openSession(ctxMenu.session); setCtxMenu(null); }}>
            Resume session
          </button>
          <button className="context-menu-item" onClick={() => handleShowPrompts(ctxMenu.session)}>
            Show prompts
          </button>
          <button className="context-menu-item" onClick={() => handleStartRename(ctxMenu.session)}>
            Rename
          </button>
          {ctxMenu.session.cwd && (
            <>
              <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.session.cwd); setCtxMenu(null); }}>
                Copy path
              </button>
              <button className="context-menu-item" onClick={() => { (window.terminalAPI as any).openPath(ctxMenu.session.cwd); setCtxMenu(null); }}>
                Open in explorer
              </button>
            </>
          )}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.session.id); setCtxMenu(null); }}>
            Copy session ID
          </button>
          <button className="context-menu-item danger" onClick={() => handleRemoveSession(ctxMenu.session)}>
            Remove from list
          </button>
        </div>
      )}
    </div>
  );
};

// ── Prompts Dialog ───────────────────────────────────────────────────

const PromptsDialog: React.FC<{
  title: string;
  prompts: string[];
  onClose: () => void;
}> = ({ title, prompts, onClose }) => {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Reverse to show newest first, then filter
  const reversed = useMemo(() => [...prompts].reverse(), [prompts]);
  const filtered = useMemo(() => {
    if (!search.trim()) return reversed;
    const q = search.toLowerCase();
    return reversed.filter((p) => p.toLowerCase().includes(q));
  }, [reversed, search]);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="ai-prompts-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ai-prompts-header">
          <span title={title}>{title}</span>
          <button className="dir-panel-close" onClick={onClose}>&#10005;</button>
        </div>
        <input
          ref={searchRef}
          className="dir-panel-search"
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}
        />
        <div className="ai-prompts-list">
          {filtered.map((p, i) => {
            const originalIndex = prompts.length - prompts.indexOf(filtered[i]);
            return (
              <div key={i} className="ai-prompt-item">
                <span className="ai-prompt-index">{prompts.length - reversed.indexOf(p)}</span>
                <span className="ai-prompt-text">{p}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="dir-panel-empty">No matching prompts</div>
          )}
        </div>
        <div className="ai-prompts-footer">
          {filtered.length} of {prompts.length} prompts
        </div>
      </div>
    </div>
  );
};

export default CopilotPanel;
