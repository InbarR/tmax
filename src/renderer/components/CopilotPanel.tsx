import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore } from '../state/terminal-store';
import { getTerminalEntry } from '../terminal-registry';
import type { CopilotSessionSummary, CopilotSessionStatus, SessionProvider, SessionLifecycle } from '../../shared/copilot-types';

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
type LifecycleTab = 'active' | 'completed' | 'old';

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

function sortSessions(
  sessions: CopilotSessionSummary[],
  openSessionIds: Set<string>,
  pinned: Record<string, true>,
): CopilotSessionSummary[] {
  return [...sessions].sort((a, b) => {
    // Pinned sessions float to the top, then open-in-tmax, then by activity.
    const aPin = pinned[a.id] ? 1 : 0;
    const bPin = pinned[b.id] ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    const aOpen = openSessionIds.has(a.id) ? 1 : 0;
    const bOpen = openSessionIds.has(b.id) ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
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
  const summaryOverrides = useTerminalStore((s) => s.sessionNameOverrides);
  const lifecycleOverrides = useTerminalStore((s) => s.sessionLifecycleOverrides);
  const pinnedSessions = useTerminalStore((s) => s.sessionPinned);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const prevFocusedIdRef = useRef<string | null>(null);
  const pendingHighlightRef = useRef<string | null>(null);

  // Track which AI session IDs have open terminals
  const openSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [, t] of terminals) {
      if (t.aiSessionId) ids.add(t.aiSessionId);
    }
    return ids;
  }, [terminals]);

  // Map AI session id -> pane color so list items can mirror the pane's color
  const tabGroups = useTerminalStore((s) => s.tabGroups);
  const defaultTabColor = useTerminalStore((s) => (s.config as any)?.defaultTabColor);
  const sessionColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const [, t] of terminals) {
      if (!t.aiSessionId) continue;
      const groupColor = t.groupId ? tabGroups.get(t.groupId)?.color : undefined;
      const color = groupColor || t.tabColor || defaultTabColor;
      if (color) m.set(t.aiSessionId, color);
    }
    return m;
  }, [terminals, tabGroups, defaultTabColor]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [lifecycleTab, setLifecycleTab] = useState<LifecycleTab>('active');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: CopilotSessionSummary } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; provider: SessionProvider; value: string } | null>(null);
  const [promptsDialog, setPromptsDialog] = useState<{ title: string; prompts: string[]; terminalId: string | null } | null>(null);
  const [showRunningOnly, setShowRunningOnly] = useState(false);
  // #69: collapsed groups - Set of repo keys the user has collapsed in-session.
  // Not persisted intentionally: collapse state is ephemeral navigation, not a preference.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Refresh session lists when panel opens
  useEffect(() => {
    if (!show) return;
    useTerminalStore.getState().loadCopilotSessions();
    useTerminalStore.getState().loadClaudeCodeSessions();
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

  // Helper to get lifecycle of a session
  const config = useTerminalStore((s) => s.config);
  const oldSessionDays = (config as any)?.oldSessionDays ?? 30;

  // #69: Group sessions by cwd's folder name. Default on; persisted in config
  // so users who explicitly turn it off stay off across restarts.
  const groupByRepo = (config as any)?.aiGroupByRepo !== false;
  const repoKey = (s: CopilotSessionSummary): string => shortPath(s.cwd || '') || '(no repo)';

  // Auto-collapse all groups on the transition from off → on, AND on initial
  // mount when grouping is on (since the default is now "on"). Users asked
  // for the initial grouped state to be compact; an expand-all button on the
  // header lets them pop them open.
  const wasGroupedRef = useRef(false);
  useEffect(() => {
    if (groupByRepo && !wasGroupedRef.current) {
      const allSessions = [...copilotSessions, ...claudeCodeSessions].filter((s) => s.messageCount > 0);
      setCollapsedGroups(new Set(allSessions.map((s) => repoKey(s))));
    }
    wasGroupedRef.current = groupByRepo;
  }, [groupByRepo, copilotSessions, claudeCodeSessions]);

  const toggleGroupByRepo = () => {
    useTerminalStore.getState().updateConfig({ aiGroupByRepo: !groupByRepo } as any);
  };

  const getSessionLifecycle = useCallback((s: CopilotSessionSummary): SessionLifecycle => {
    const override = lifecycleOverrides[s.id];
    if (override) return override;
    const thresholdMs = oldSessionDays * 24 * 60 * 60 * 1000;
    if (s.lastActivityTime && s.lastActivityTime < Date.now() - thresholdMs) return 'old';
    return 'active';
  }, [lifecycleOverrides, oldSessionDays]);

  // Merge, deduplicate, and filter sessions
  const filtered = useMemo(() => {
    let all = [
      ...copilotSessions.filter((s) => s.messageCount > 0).map((s) => ({ ...s, provider: s.provider || 'copilot' as const })),
      ...claudeCodeSessions.filter((s) => s.messageCount > 0).map((s) => ({ ...s, provider: s.provider || 'claude-code' as const })),
    ].map((s) => summaryOverrides[s.id] ? { ...s, summary: summaryOverrides[s.id] } : s);

    // Filter by provider
    if (filterTab !== 'all') {
      all = all.filter((s) => s.provider === filterTab);
    }

    // Filter to running (non-idle) sessions only
    if (showRunningOnly) {
      all = all.filter((s) => s.status !== 'idle');
    }

    // Deduplicate by session ID
    const byId = new Map<string, CopilotSessionSummary>();
    for (const s of all) {
      const existing = byId.get(s.id);
      if (!existing || (s.lastActivityTime || 0) > (existing.lastActivityTime || 0)) {
        byId.set(s.id, s);
      }
    }

    // Filter by lifecycle tab
    const deduped = Array.from(byId.values());
    const lifecycleFiltered = deduped.filter((s) => getSessionLifecycle(s) === lifecycleTab);

    return sortSessions(lifecycleFiltered, openSessionIds, pinnedSessions);
  }, [copilotSessions, claudeCodeSessions, query, filterTab, showRunningOnly, summaryOverrides, lifecycleTab, getSessionLifecycle, openSessionIds, pinnedSessions]);

  // #69: when groupByRepo is on, reorder filtered so sessions sharing a cwd
  // folder are contiguous, and groups are sorted by the most-recent activity
  // within each group. Sessions without a cwd go to "(no repo)" at the end.
  const displayList = useMemo(() => {
    if (!groupByRepo) return filtered;
    const groups = new Map<string, CopilotSessionSummary[]>();
    for (const s of filtered) {
      const key = repoKey(s);
      const bucket = groups.get(key);
      if (bucket) bucket.push(s); else groups.set(key, [s]);
    }
    const sortedGroups = [...groups.entries()].sort(([ak, av], [bk, bv]) => {
      if (ak === '(no repo)') return 1;
      if (bk === '(no repo)') return -1;
      const aRecent = Math.max(...av.map((s) => s.lastActivityTime || 0));
      const bRecent = Math.max(...bv.map((s) => s.lastActivityTime || 0));
      return bRecent - aRecent;
    });
    return sortedGroups.flatMap(([, group]) => group);
  }, [filtered, groupByRepo]);

  // #69: counts per group key so the collapsible header can show `tmax · 3`.
  const groupSizes = useMemo(() => {
    const m = new Map<string, number>();
    if (!groupByRepo) return m;
    for (const s of displayList) {
      const key = repoKey(s);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [displayList, groupByRepo]);

  // Sessions that share the exact same title - automation scripts often spawn
  // many `claude` runs with the same initial prompt, making them visually
  // indistinguishable. Flag duplicates so the render can append a short
  // session-ID suffix to disambiguate.
  const dupTitles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of displayList) {
      const t = getTitle(s);
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const dups = new Set<string>();
    for (const [t, n] of counts) if (n > 1) dups.add(t);
    return dups;
  }, [displayList]);

  // Lifecycle counts (for tab badges) — computed from all sessions regardless of provider/running filter
  const lifecycleCounts = useMemo(() => {
    const allSessions = [
      ...copilotSessions.filter((s) => s.messageCount > 0),
      ...claudeCodeSessions.filter((s) => s.messageCount > 0),
    ];
    // Deduplicate
    const byId = new Map<string, CopilotSessionSummary>();
    for (const s of allSessions) {
      const existing = byId.get(s.id);
      if (!existing || (s.lastActivityTime || 0) > (existing.lastActivityTime || 0)) {
        byId.set(s.id, s);
      }
    }
    const counts = { active: 0, completed: 0, old: 0 };
    for (const s of byId.values()) {
      counts[getSessionLifecycle(s)]++;
    }
    return counts;
  }, [copilotSessions, claudeCodeSessions, getSessionLifecycle]);

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

  // Auto-highlight the AI session belonging to the focused terminal pane.
  // Edge-triggered on focusedTerminalId change; does not force-open the panel.
  // If the session is in a different lifecycle tab, switches tab and uses a
  // pending ref so the selection resolves after the tab-switch re-render.
  useEffect(() => {
    if (!show) return;
    if (focusedTerminalId === prevFocusedIdRef.current) return;
    prevFocusedIdRef.current = focusedTerminalId;
    if (!focusedTerminalId) return;

    const store = useTerminalStore.getState();
    const terminal = store.terminals.get(focusedTerminalId);
    const aiSessionId = terminal?.aiSessionId;
    if (!aiSessionId) return;

    const session = [...store.copilotSessions, ...store.claudeCodeSessions].find((s) => s.id === aiSessionId);
    if (!session) return;

    const sessionLifecycle = getSessionLifecycle(session);
    if (sessionLifecycle !== lifecycleTab) {
      pendingHighlightRef.current = aiSessionId;
      setLifecycleTab(sessionLifecycle);
    } else {
      const idx = filtered.findIndex((s) => s.id === aiSessionId);
      if (idx >= 0) setSelectedIndex(idx);
    }
  }, [focusedTerminalId, show, lifecycleTab, filtered, getSessionLifecycle]);

  // Resolve a pending highlight after a tab switch has re-rendered `filtered`.
  useEffect(() => {
    const id = pendingHighlightRef.current;
    if (!id) return;
    const idx = filtered.findIndex((s) => s.id === id);
    if (idx >= 0) {
      setSelectedIndex(idx);
      pendingHighlightRef.current = null;
    }
  }, [filtered]);

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
      useTerminalStore.getState().setSessionNameOverride(renaming.id, newSummary);
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
    // Find terminal with matching aiSessionId
    let matchedTerminalId: string | null = null;
    const store = useTerminalStore.getState();
    for (const [tid, t] of store.terminals) {
      if (t.aiSessionId === session.id) {
        matchedTerminalId = tid;
        break;
      }
    }
    setPromptsDialog({
      title: summaryOverrides[session.id] || session.summary || getTitle(session),
      prompts: prompts.length > 0 ? prompts : ['(no prompts found)'],
      terminalId: matchedTerminalId,
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

  // Debounce the IPC search so we don't re-grep every .jsonl on each keystroke.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const store = useTerminalStore.getState();
      store.searchCopilotSessions(value);
      store.searchClaudeCodeSessions(value);
    }, 200);
  }, []);

  // Listen for keybinding-triggered prompts dialog request
  const promptsRequest = useTerminalStore((s) => s.promptsDialogRequest);
  useEffect(() => {
    if (!promptsRequest) return;
    const { terminalId: tid } = promptsRequest;
    const store = useTerminalStore.getState();
    store.clearPromptsDialogRequest();
    // Find the AI session for this terminal
    const terminal = store.terminals.get(tid);
    const allSessions = [...store.copilotSessions, ...store.claudeCodeSessions];
    let session: typeof allSessions[0] | undefined;
    if (terminal?.aiSessionId) {
      session = allSessions.find((s) => s.id === terminal.aiSessionId);
    }
    // Fallback: find the most recent session matching this terminal's CWD
    if (!session && terminal?.cwd) {
      const cwd = terminal.cwd.replace(/\\/g, '/').toLowerCase();
      session = allSessions
        .filter((s) => s.cwd?.replace(/\\/g, '/').toLowerCase() === cwd)
        .sort((a, b) => (b.lastActivityTime || 0) - (a.lastActivityTime || 0))[0];
    }
    if (!session) return;
    const sessionId = session.id;
    // Load prompts
    const api = window.terminalAPI as any;
    const loadPrompts = session.provider === 'claude-code'
      ? api.getClaudeCodePrompts(sessionId)
      : api.getCopilotPrompts(sessionId);
    loadPrompts.then((prompts: string[]) => {
      setPromptsDialog({
        title: summaryOverrides[sessionId] || session.summary || getTitle(session),
        prompts: prompts.length > 0 ? prompts : ['(no prompts found)'],
        terminalId: tid,
      });
    });
  }, [promptsRequest, summaryOverrides]);

  // Always render the prompts dialog portal (even when panel is hidden)
  const promptsPortal = promptsDialog && ReactDOM.createPortal(
    <PromptsDialog
      title={promptsDialog.title}
      prompts={promptsDialog.prompts}
      terminalId={promptsDialog.terminalId}
      onClose={() => setPromptsDialog(null)}
    />,
    document.body,
  );

  if (!show) return promptsPortal || null;

  // Counts for filter tabs (deduplicated)
  const copilotCount = copilotSessions.filter((s) => s.messageCount > 0).length;
  const claudeCount = claudeCodeSessions.filter((s) => s.messageCount > 0).length;
  const allCount = copilotCount + claudeCount;

  return (
    <div className={`copilot-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="dir-panel-resize" onMouseDown={handleResizeStart} />

      <div className="dir-panel-header">
        <span>✨ AI Sessions</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            className={`ai-session-tab${showRunningOnly ? ' active' : ''}`}
            onClick={() => setShowRunningOnly((v) => !v)}
            data-tooltip="Show running only"
            style={{ fontSize: '10px', padding: '1px 6px' }}
          >
            Running
          </button>
          <button
            className={`ai-session-tab${groupByRepo ? ' active' : ''}`}
            onClick={toggleGroupByRepo}
            data-tooltip="Group sessions by repo"
            style={{ fontSize: '10px', padding: '1px 6px' }}
          >
            Group
          </button>
          {groupByRepo && (() => {
            const allKeys = Array.from(groupSizes.keys());
            const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsedGroups.has(k));
            return (
              <button
                className="ai-session-tab"
                onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(allKeys))}
                data-tooltip={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
                style={{ fontSize: '10px', padding: '1px 6px' }}
              >
                {allCollapsed ? '▸ Expand' : '▾ Collapse'}
              </button>
            );
          })()}
          <button className="dir-panel-close" onClick={handleRefresh} data-tooltip="Refresh"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1v5h5"/><path d="M3.5 10a5.5 5.5 0 1 0 1.1-5.5L1 8"/></svg></button>
          <button className="dir-panel-close" onClick={() => useTerminalStore.getState().toggleCopilotPanel()} data-tooltip="Close">&#10005;</button>
        </div>
      </div>

      {/* Lifecycle tabs */}
      <div className="ai-session-tabs">
        <button
          className={`ai-session-tab${lifecycleTab === 'active' ? ' active' : ''}`}
          onClick={() => setLifecycleTab('active')}
          title="Sessions currently in use or recently active"
        >
          Active{lifecycleCounts.active > 0 ? ` (${lifecycleCounts.active})` : ''}
        </button>
        <button
          className={`ai-session-tab${lifecycleTab === 'completed' ? ' active' : ''}`}
          onClick={() => setLifecycleTab('completed')}
          title="Sessions you marked as done"
        >
          Completed{lifecycleCounts.completed > 0 ? ` (${lifecycleCounts.completed})` : ''}
        </button>
        <button
          className={`ai-session-tab${lifecycleTab === 'old' ? ' active' : ''}`}
          onClick={() => setLifecycleTab('old')}
          title={`Sessions inactive for ${oldSessionDays}+ days`}
        >
          Archived{lifecycleCounts.old > 0 ? ` (${lifecycleCounts.old})` : ''}
        </button>
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
        {displayList.map((session, index) => {
          const title = getTitle(session);
          const subtitle = getSubtitle(session);
          const active = isActiveStatus(session.status);
          const isOpen = openSessionIds.has(session.id);
          const time = relativeTime(session.lastActivityTime);
          const hasStats = session.messageCount > 0 || session.toolCallCount > 0;
          const paneColor = sessionColors.get(session.id);
          // Left accent border mirrors the pane's color so you can match
          // sessions with their open pane at a glance.
          const itemStyle = paneColor ? { borderLeft: `3px solid ${paneColor}` } : undefined;
          const currentRepo = repoKey(session);
          const prevRepo = index > 0 ? repoKey(displayList[index - 1]) : null;
          const showGroupHeader = groupByRepo && currentRepo !== prevRepo;
          const isCollapsed = groupByRepo && collapsedGroups.has(currentRepo);

          return (
            <React.Fragment key={`${session.provider}-${session.id}`}>
              {showGroupHeader && (
                <div
                  className={`ai-session-group-header${isCollapsed ? ' collapsed' : ''}`}
                  title={currentRepo}
                  onClick={() => toggleGroupCollapsed(currentRepo)}
                >
                  <span className="ai-session-group-chevron">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="ai-session-group-name">{currentRepo}</span>
                  <span className="ai-session-group-count">{groupSizes.get(currentRepo) || 0}</span>
                </div>
              )}
              {!isCollapsed && <>
            <div
              style={itemStyle}
              className={`ai-session-item${index === selectedIndex ? ' selected' : ''}${selectedSessionIds.has(session.id) ? ' multi-selected' : ''}${active ? ' active' : ''}`}
              onClick={(e) => {
                setSelectedIndex(index);
                if (e.ctrlKey || e.metaKey) {
                  setSelectedSessionIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(session.id)) next.delete(session.id); else next.add(session.id);
                    return next;
                  });
                } else {
                  setSelectedSessionIds(new Set([session.id]));
                }
              }}
              onDoubleClick={() => openSession(session)}
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
                      {pinnedSessions[session.id] && (
                        <span
                          className="ai-session-pin"
                          title="Pinned (right-click to unpin)"
                          onClick={(e) => {
                            e.stopPropagation();
                            useTerminalStore.getState().togglePinSession(session.id);
                          }}
                        >📌</span>
                      )}
                      {title}
                      {dupTitles.has(title) && (
                        <span className="ai-session-iddup" title={session.id}> · {session.id.slice(0, 6)}</span>
                      )}
                    </span>
                  )}
                  {isOpen && <span className="ai-open-badge">OPEN</span>}
                  {session.wsl && (
                    <span className="ai-wsl-badge" title={session.wslDistro || 'WSL'}>
                      {session.wslDistro || 'WSL'}
                    </span>
                  )}
                  {time && <span className="ai-session-time">{time}</span>}
                </div>
                {session.cwd && (
                  <div className="ai-session-cwd" title={session.cwd}>{shortPath(session.cwd)}</div>
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
                  {session.model && (
                    <span className="ai-session-stat">{session.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}</span>
                  )}
                  {hasStats && (
                    <>
                      <span className="ai-session-stat">{session.messageCount} prompts</span>
                      {session.toolCallCount > 0 && (
                        <span className="ai-session-stat">{session.toolCallCount} tools</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Complete button (Active tab) or Reactivate button (Completed/Old tabs) */}
              {lifecycleTab === 'active' && (
                <button
                  className="ai-session-lifecycle-btn ai-session-complete-btn"
                  title="Mark as completed"
                  onClick={(e) => {
                    e.stopPropagation();
                    useTerminalStore.getState().setSessionLifecycle(session.id, 'completed');
                  }}
                >
                  ✓
                </button>
              )}
              {(lifecycleTab === 'completed' || lifecycleTab === 'old') && (
                <button
                  className="ai-session-lifecycle-btn ai-session-reactivate-btn"
                  title="Move back to Active"
                  onClick={(e) => {
                    e.stopPropagation();
                    useTerminalStore.getState().setSessionLifecycle(session.id, 'active');
                  }}
                >
                  ↩
                </button>
              )}
            </div>
            </>}
            </React.Fragment>
          );
        })}
        {displayList.length === 0 && (
          <div className="dir-panel-empty">
            {lifecycleTab === 'active' && allCount === 0
              ? 'No AI sessions found'
              : lifecycleTab === 'completed'
              ? 'No completed sessions'
              : lifecycleTab === 'old'
              ? 'No old sessions'
              : 'No matching sessions'}
          </div>
        )}
      </div>

      {promptsPortal}

      {ctxMenu && (
        <div ref={(el) => {
          (ctxRef as any).current = el;
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 4) {
              el.style.top = `${Math.max(4, ctxMenu.y - rect.height)}px`;
            }
            if (rect.right > window.innerWidth - 4) {
              el.style.left = `${Math.max(4, ctxMenu.x - rect.width)}px`;
            }
          }
        }} className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          <button className="context-menu-item" onClick={() => { openSession(ctxMenu.session); setCtxMenu(null); }}>
            ▶ Resume session <span className="context-menu-shortcut">double-click</span>
          </button>
          <button className="context-menu-item" onClick={() => handleShowPrompts(ctxMenu.session)}>
            💬 Show prompts
          </button>
          <button className="context-menu-item" onClick={() => handleStartRename(ctxMenu.session)}>
            ✏️ Rename
          </button>
          <button className="context-menu-item" onClick={() => { useTerminalStore.getState().togglePinSession(ctxMenu.session.id); setCtxMenu(null); }}>
            {pinnedSessions[ctxMenu.session.id] ? '📌 Unpin' : '📌 Pin to top'}
          </button>
          {ctxMenu.session.cwd && (
            <>
              <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.session.cwd); setCtxMenu(null); }}>
                📋 Copy path
              </button>
              <button className="context-menu-item" onClick={() => { (window.terminalAPI as any).openPath(ctxMenu.session.cwd); setCtxMenu(null); }}>
                📂 Open in explorer
              </button>
            </>
          )}
          <div className="context-menu-separator" />
          {(() => {
            const targets = selectedSessionIds.size > 1 ? Array.from(selectedSessionIds) : [ctxMenu.session.id];
            const currentLifecycle = getSessionLifecycle(ctxMenu.session);
            return (
              <>
                {currentLifecycle !== 'active' && (
                  <button className="context-menu-item" onClick={() => { targets.forEach((id) => useTerminalStore.getState().setSessionLifecycle(id, 'active')); setCtxMenu(null); setSelectedSessionIds(new Set()); }}>
                    🔄 Move to Active{targets.length > 1 ? ` (${targets.length})` : ''}
                  </button>
                )}
                {currentLifecycle !== 'completed' && (
                  <button className="context-menu-item" onClick={() => { targets.forEach((id) => useTerminalStore.getState().setSessionLifecycle(id, 'completed')); setCtxMenu(null); setSelectedSessionIds(new Set()); }}>
                    ✅ Mark Completed{targets.length > 1 ? ` (${targets.length})` : ''}
                  </button>
                )}
                {currentLifecycle !== 'old' && (
                  <button className="context-menu-item" onClick={() => { targets.forEach((id) => useTerminalStore.getState().setSessionLifecycle(id, 'old')); setCtxMenu(null); setSelectedSessionIds(new Set()); }}>
                    🕐 Archive{targets.length > 1 ? ` (${targets.length})` : ''}
                  </button>
                )}
              </>
            );
          })()}
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.session.id); setCtxMenu(null); }}>
            🔗 Copy session ID
          </button>
          <button className="context-menu-item danger" onClick={() => handleRemoveSession(ctxMenu.session)}>
            🗑️ Remove from list
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
  terminalId: string | null;
  onClose: () => void;
}> = ({ title, prompts, terminalId, onClose }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jumpWarning, setJumpWarning] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0); }, [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const jumpToPrompt = useCallback((promptText: string) => {
    if (!terminalId) {
      setJumpWarning('No terminal is linked to this session.');
      return;
    }
    const entry = getTerminalEntry(terminalId);
    if (!entry) {
      setJumpWarning('Terminal is no longer open.');
      return;
    }
    const { searchAddon, terminal } = entry;
    searchAddon.clearDecorations();
    const opts = {
      decorations: {
        matchOverviewRuler: '#888',
        activeMatchColorOverviewRuler: '#fff',
        matchBackground: '#585b70',
        activeMatchBackground: '#89b4fa',
      },
    };
    // Strip trailing whitespace/newlines that xterm wouldn't render the same
    // way, and cap the length so regex-unfriendly prompts don't hurt.
    const trimmed = promptText.trim();
    const tryQuery = (q: string): boolean => {
      if (!q) return false;
      return searchAddon.findPrevious(q, opts);
    };
    // Try in order: full trimmed prompt, first 80 chars, first 40 chars.
    // A shorter prefix usually still matches a unique point in the buffer
    // even if the full prompt was wrapped or re-rendered.
    const found =
      tryQuery(trimmed.slice(0, 120)) ||
      tryQuery(trimmed.slice(0, 60)) ||
      tryQuery(trimmed.slice(0, 30));
    try {
      (window as any).terminalAPI?.diagLog?.('renderer:jump-to-prompt', {
        terminalId,
        queryLen: trimmed.length,
        found,
      });
    } catch { /* ignore */ }
    if (!found) {
      setJumpWarning(
        'Not found in terminal buffer. TUIs like Claude Code keep their own history - try scrolling inside the app, or the buffer may have been cleared.',
      );
      return;
    }
    onClose();
    requestAnimationFrame(() => terminal.focus());
  }, [terminalId, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); e.stopPropagation(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      jumpToPrompt(filtered[selectedIndex]);
      return;
    }
    e.stopPropagation();
  }, [filtered, selectedIndex, jumpToPrompt, onClose]);

  const canJump = !!terminalId;

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
          onKeyDown={handleKeyDown}
        />
        {jumpWarning && (
          <div className="ai-prompts-warning">{jumpWarning}</div>
        )}
        <div className="ai-prompts-list" ref={listRef}>
          {filtered.map((p, i) => (
            <div
              key={i}
              className={`ai-prompt-item${i === selectedIndex ? ' selected' : ''}${canJump ? ' clickable' : ''}`}
              onClick={() => canJump && jumpToPrompt(p)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="ai-prompt-index">{prompts.length - reversed.indexOf(p)}</span>
              <span className="ai-prompt-text">{p}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="dir-panel-empty">No matching prompts</div>
          )}
        </div>
        <div className="ai-prompts-footer">
          {filtered.length} of {prompts.length} prompts
          {canJump && <span className="ai-prompts-hint"> · click or Enter to jump</span>}
        </div>
      </div>
    </div>
  );
};

export default CopilotPanel;
