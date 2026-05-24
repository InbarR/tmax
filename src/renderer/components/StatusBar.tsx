import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore, findSessionById } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';
import { formatKeyForPlatform, isDev } from '../utils/platform';
import InputDialog from './InputDialog';
import type { TerminalInstance } from '../state/types';
import type { CopilotSessionStatus, CopilotSessionSummary } from '../../shared/copilot-types';

interface UpdateInfoState {
  status: string;
  current: string;
  latest?: string;
  url?: string;
  releaseNotes?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// TASK-130: render GitHub-style markdown tables (| col | col |) into HTML
// tables so the release-notes Download grid stops bleeding raw pipes into
// the update modal.
function renderTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const sep = lines[i + 1];
    // Header row: starts and (optionally) ends with `|`, has at least one `|`
    // inside. Separator row: same shape but each cell is dashes/colons only.
    if (
      /^\s*\|.*\|\s*$/.test(header) &&
      sep !== undefined &&
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(sep)
    ) {
      const headerCells = header.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        rows.push(lines[j].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        j++;
      }
      out.push('<table><thead><tr>' +
        headerCells.map((c) => `<th>${c}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      i = j;
      continue;
    }
    out.push(header);
    i++;
  }
  return out.join('\n');
}

// TASK-130: subset of HTML tags we trust to pass through the markdown
// renderer unescaped (release notes are author-controlled, not user input).
// Restoring these specific tags after the global escape keeps everything
// else safely HTML-escaped.
const PASSTHROUGH_TAG_RE = /&lt;(\/?(?:details|summary|br|hr))(\s[^&]*?)?&gt;/g;
function restorePassthroughTags(html: string): string {
  return html.replace(PASSTHROUGH_TAG_RE, (_m, tag, attrs) => `<${tag}${attrs ?? ''}>`);
}

function renderMarkdown(md: string): string {
  // Tables are parsed BEFORE escapeHtml so the raw `|` separators are still
  // matchable; the resulting <table>...</table> will get escaped into
  // entities and then restored by restorePassthroughTags below.
  let html = renderTables(md);
  html = escapeHtml(html);
  html = restorePassthroughTags(html);
  // Re-allow the table tags we just emitted (we emitted them as plain <table>
  // but escapeHtml turned them into &lt;table&gt;). Restore them too.
  html = html
    .replace(/&lt;(\/?(?:table|thead|tbody|tr|th|td)(?:\s[^&]*?)?)&gt;/g, '<$1>');
  return html
    // Headings
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code (backticks): escape contents already escaped, just wrap
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Bare URLs
    .replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    // Bullet lists (both * and -)
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Strip newlines adjacent to block elements (prevent extra <br/>)
    .replace(/\n*(<\/?(?:h[1-6]|ul|li|p|table|thead|tbody|tr|th|td|details|summary)>)\n*/g, '$1')
    // Remaining line breaks
    .replace(/\n/g, '<br/>');
}

const UpdateModal: React.FC<{ info: UpdateInfoState; appVersion: string; onClose: () => void }> = ({ info, appVersion, onClose }) => {
  return (
    <div className="update-modal-overlay" onClick={onClose}>
      <div className="update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="update-modal-header">
          <h2>Update Available</h2>
          <button className="update-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="update-modal-version">
          v{appVersion} &rarr; v{info.latest}
        </div>
        {info.releaseNotes && (
          <div className="update-modal-notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(
            // Deduplicate repeated lines (e.g. from force-pushed releases)
            [...new Set(info.releaseNotes.split('\n'))].join('\n')
          ) }} />
        )}
        <div className="update-modal-actions">
          {info.status === 'downloaded' ? (
            <button className="update-modal-btn primary" onClick={() => window.terminalAPI.restartAndUpdate()}>
              Restart &amp; Update
            </button>
          ) : (
            // Always show a Download button. Prefer the release-specific
            // url from the version-checker when available; otherwise fall
            // back to the canonical "latest release" URL so the user is
            // never left with only a Later button (TASK-93).
            <button
              className="update-modal-btn primary"
              onClick={() => window.open(info.url || `https://github.com/InbarR/tmax/releases/latest`, '_blank')}
            >
              Download
            </button>
          )}
          <button className="update-modal-btn" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
};

const ChangelogModal: React.FC<{ content: string; loading: boolean; onClose: () => void }> = ({ content, loading, onClose }) => {
  return (
    <div className="update-modal-overlay" onClick={onClose}>
      <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="update-modal-header">
          <h2>Changelog</h2>
          <button className="update-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="changelog-modal-content">
          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem' }}>Loading changelog...</p>
          ) : content ? (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(
              content.replace(/^# Changelog\s*\n/, '')
            ) }} />
          ) : (
            <p>Could not load changelog.</p>
          )}
        </div>
        <div className="update-modal-actions">
          <a
            className="update-modal-link"
            href="https://github.com/InbarR/tmax/releases"
            onClick={(e) => {
              e.preventDefault();
              window.open('https://github.com/InbarR/tmax/releases', '_blank');
            }}
            title="Open releases page in your default browser"
          >
            View on GitHub →
          </a>
          <button className="update-modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// TASK-145: popover that lists every terminal in the current scope (active
// workspace, or all in flat mode) when the user clicks the terminal-count
// label in the status bar. Each row shows the title, a mode pill, and an AI
// session status dot when the pane is linked to a Copilot/Claude Code session.
// Clicking a row focuses that terminal and dismisses the popover.
const AI_STATUS_LABEL: Record<CopilotSessionStatus, string> = {
  idle: 'idle',
  thinking: 'thinking',
  executingTool: 'executing tool',
  awaitingApproval: 'awaiting approval',
  waitingForUser: 'waiting for user',
};

interface TerminalListEntry {
  id: string;
  terminal: TerminalInstance;
  aiStatus: CopilotSessionStatus | null;
}

interface TerminalListPopoverProps {
  entries: TerminalListEntry[];
  anchor: { right: number; bottom: number } | null;
  onClose: () => void;
}

const TerminalListPopover: React.FC<TerminalListPopoverProps> = ({ entries, anchor, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape. Escape uses capture so xterm.js doesn't
  // swallow it first - same pattern used by TabContextMenu.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className="terminal-list-popover"
      onClick={(e) => e.stopPropagation()}
      style={anchor ? {
        left: 'auto',
        bottom: anchor.bottom,
        right: anchor.right,
      } : undefined}
    >
      <div className="terminal-list-popover-header">
        <span>Terminals ({entries.length})</span>
      </div>
      {entries.length === 0 ? (
        <div className="terminal-list-popover-empty">No terminals</div>
      ) : (
        entries.map(({ id, terminal, aiStatus }) => (
          <button
            key={id}
            type="button"
            className="terminal-list-popover-item"
            onClick={() => {
              useTerminalStore.getState().setFocus(id);
              onClose();
            }}
            title={terminal.cwd || terminal.title}
          >
            <span className="terminal-list-popover-title">{terminal.title || 'Untitled'}</span>
            <span className={`terminal-list-popover-mode mode-${terminal.mode}`}>{terminal.mode}</span>
            {aiStatus && (
              <span className={`terminal-list-popover-ai ai-${aiStatus}`} title={`AI: ${AI_STATUS_LABEL[aiStatus]}`}>
                <span className="terminal-list-popover-ai-dot" />
                {AI_STATUS_LABEL[aiStatus]}
              </span>
            )}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
};

const StatusBar: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoState | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [shownVersion, setShownVersion] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showZoomDialog, setShowZoomDialog] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogContent, setChangelogContent] = useState('');
  const [changelogLoading, setChangelogLoading] = useState(false);

  const submitReport = async () => {
    const template = `**Version:** ${appVersion}\n**Platform:** ${navigator.platform}\n\n**Description:**\n\n\n**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**\n`;

    // TASK-164: embed a short diag tail directly in the issue URL so the
    // reporter doesn't have to paste from clipboard manually. Cap at 5 KB
    // so the URL+template stays well under GitHub's prefill limit (~8 KB
    // for the query string after URL-encoding). A fuller 25 KB version
    // still lands on the clipboard for users who want to attach more.
    let diagShort = '';
    let diagFull = '';
    try {
      const tail = await (window.terminalAPI as any).readDiagLogTail?.(25 * 1024);
      if (tail && typeof tail === 'string' && tail.trim().length > 0) {
        diagFull = `\n\n<details>\n<summary>Diagnostic log (last ~25 KB)</summary>\n\n\`\`\`\n${tail}\n\`\`\`\n\n</details>\n`;
        // Slice the most-recent 5 KB so the latest entries (= closest to
        // the bug) make it into the URL-embedded version.
        const shortTail = tail.length > 5 * 1024 ? tail.slice(tail.length - 5 * 1024) : tail;
        diagShort = `\n\n<details>\n<summary>Diagnostic log (last ~5 KB - more on clipboard)</summary>\n\n\`\`\`\n${shortTail}\n\`\`\`\n\n</details>\n`;
      }
    } catch { /* ignore - report still goes through */ }

    const urlBody = template + diagShort;
    const clipboardBody = template + diagFull;
    const url = `https://github.com/InbarR/tmax/issues/new?body=${encodeURIComponent(urlBody)}`;
    window.terminalAPI.clipboardWrite(clipboardBody);
    window.open(url, '_blank');
    setShowReportModal(false);
  };

  const openChangelog = async () => {
    setShowChangelog(true);
    setChangelogLoading(true);
    try {
      const text = await window.terminalAPI.getChangelog();
      setChangelogContent(text);
    } catch {
      setChangelogContent('');
    }
    setChangelogLoading(false);
  };

  useEffect(() => {
    window.terminalAPI.getAppVersion().then(setAppVersion);
    window.terminalAPI.getVersionUpdate().then((info) => {
      if (info) setUpdateInfo(info);
    });
    const cleanup = window.terminalAPI.onUpdateStatusChanged((info) => {
      setUpdateInfo(info);
    });
    return cleanup;
  }, []);

  // Auto-show modal when a new version is downloaded or available
  useEffect(() => {
    if (updateInfo && (updateInfo.status === 'downloaded' || updateInfo.status === 'available') && updateInfo.latest && updateInfo.latest !== shownVersion) {
      setShownVersion(updateInfo.latest);
      setShowUpdateModal(true);
    }
  }, [updateInfo?.status, updateInfo?.latest]);

  const terminals = useTerminalStore((s) => s.terminals);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const layout = useTerminalStore((s) => s.layout);

  // Dormant terminals - hidden via the per-pane menu's 'Hide pane'. Without
  // this list, the only way to bring them back was clicking them in the tab
  // bar; with the bar hidden (Ctrl+Shift+B) they were unreachable. The
  // indicator below is the always-on alternative.
  const dormantTerminals = React.useMemo(() => {
    const out: { id: string; title: string; cwd: string; pid: number; lastProcess: string }[] = [];
    let i = 0;
    for (const [id, t] of terminals) {
      i++;
      if (t.mode === 'dormant') {
        out.push({
          id,
          title: t.title || `Terminal ${i}`,
          cwd: t.cwd || '',
          pid: t.pid,
          lastProcess: t.lastProcess || '',
        });
      }
    }
    return out;
  }, [terminals]);
  const [dormantPopoverOpen, setDormantPopoverOpen] = useState(false);
  // Anchor for the dormant popover - so it opens directly above the
  // 👁 hidden button no matter where in the footer the button sits.
  const [dormantPopoverAnchor, setDormantPopoverAnchor] = useState<{ right: number; bottom: number } | null>(null);
  // TASK-145: popover that lists every terminal in scope (workspace-aware)
  // with mode + AI status. Anchored above the terminal-count button.
  const [terminalListOpen, setTerminalListOpen] = useState(false);
  const [terminalListAnchor, setTerminalListAnchor] = useState<{ right: number; bottom: number } | null>(null);
  // Overflow menu for low-traffic footer items (Colors, Logs, Report).
  // Keeps the status bar from growing every time we add a new tool.
  const [overflowOpen, setOverflowOpen] = useState(false);

  const fontSize = useTerminalStore((s) => s.fontSize);
  const config = useTerminalStore((s) => s.config);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const broadcastMode = useTerminalStore((s) => s.broadcastMode);
  const gridColumns = useTerminalStore((s) => s.gridColumns);
  const hasAnyColor = useTerminalStore((s) => s.autoColorTabs);
  const hideTabBar = useTerminalStore((s) => s.hideTabTitles);
  const focused = focusedId ? terminals.get(focusedId) : null;
  // Rotating tips in the status bar. Cycle through ~20 short hints so users
  // discover features without us dumping a help screen on them. Tips marked
  // ai:true only appear when the focused pane is linked to an AI session.
  const focusedAiSession = useTerminalStore((s) => {
    if (!focused?.aiSessionId) return null;
    return findSessionById(s.copilotSessions, s.claudeCodeSessions, focused.aiSessionId);
  });
  const TIPS: { text: string; ai?: boolean }[] = React.useMemo(() => [
    { text: 'Ctrl+U clears the input line in Claude Code / Copilot CLI (Ctrl+C interrupts the agent).', ai: true },
    { text: 'Press F5 to send "continue" to the focused AI session.', ai: true },
    { text: 'Click the prompt text on the banner to jump to it in the scrollback.', ai: true },
    { text: 'Click the colored dot on the banner for a story-style session summary.', ai: true },
    { text: 'Right-click an AI session in the sidebar → 📖 View summary.', ai: true },
    { text: 'Pin AI sessions to the top with the 📌 button or right-click menu.', ai: true },
    { text: 'Ctrl+Shift+K opens the prompts history for the focused pane.' },
    { text: 'Ctrl+Shift+Y searches every pane\'s prompts and jumps to the match.' },
    { text: 'Ctrl+Shift+G jumps to a terminal by name.' },
    { text: 'Ctrl+Shift+J shows pane hints — press a letter to jump to that pane.' },
    { text: 'Ctrl+T opens a new terminal; Ctrl+Shift+W closes the focused one.' },
    { text: 'Ctrl+Shift+A toggles broadcast — typing goes to every tiled pane.' },
    { text: 'Ctrl+Shift+B hides the tab bar to save vertical space.' },
    { text: 'Ctrl+Shift+F cycles view modes: split / focus / grid.' },
    { text: 'Ctrl+Shift+L cycles grid column count.' },
    { text: 'Ctrl + mouse wheel zooms the focused terminal.' },
    { text: 'Double-click a pane title to rename it.' },
    { text: 'Hover a pane title → ⋯ menu has Float, Detach, Hide, Diff and more.' },
    { text: 'Drag a pane title onto another pane to swap, or to an edge to split.' },
    { text: 'Paste a URL — tmax unwraps Outlook safelinks automatically.' },
    { text: 'Click any row of a multi-line URL to open the full link.' },
    { text: 'Hidden a pane and lost the tab bar? The 👁 indicator on the left brings them back.' },
  ], []);
  const eligibleTips = React.useMemo(
    () => TIPS.filter((t) => !t.ai || !!focusedAiSession),
    [TIPS, focusedAiSession],
  );
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => i + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // Reset cycle when the eligible set changes (focusing AI vs non-AI flips
  // which tips are valid). Without this we could land on an AI-only tip
  // right after focusing a non-AI pane and have to wait 30s for it to roll.
  useEffect(() => { setTipIndex(0); }, [eligibleTips.length, !!focusedAiSession]);
  const currentTip = eligibleTips.length > 0 ? eligibleTips[tipIndex % eligibleTips.length] : null;
  // In workspaces tab mode, scope the count to the active workspace so it
  // matches what the user sees on screen (same pattern as TASK-138's Ctrl+P
  // switcher). In flat tab mode, every terminal is its own visible tab so
  // the global count is the right number.
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId);
  const tabMode = (config as unknown as { tabMode?: 'flat' | 'workspaces' } | undefined)?.tabMode ?? 'workspaces';
  const totalCount = React.useMemo(() => {
    if (tabMode === 'flat') return terminals.size;
    let n = 0;
    for (const [, t] of terminals) {
      if ((t as { workspaceId?: string }).workspaceId === activeWorkspaceId) n++;
    }
    return n;
  }, [terminals, activeWorkspaceId, tabMode]);
  const tiledCount = layout.tilingRoot ? getLeafOrder(layout.tilingRoot).length : 0;
  const floatingCount = layout.floatingPanels.length;

  // TASK-145: terminals visible in the popover. Mirror the count's
  // workspace-awareness: in flat tab mode every terminal is its own tab so
  // the global list is right; in workspaces mode show only the active one
  // (keeps the list aligned with what the user sees on screen).
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);
  const terminalListEntries = React.useMemo<TerminalListEntry[]>(() => {
    const findStatus = (aiSessionId: string | undefined): CopilotSessionStatus | null => {
      if (!aiSessionId) return null;
      return findSessionById(copilotSessions, claudeCodeSessions, aiSessionId)?.status ?? null;
    };
    const out: TerminalListEntry[] = [];
    for (const [id, t] of terminals) {
      if (tabMode !== 'flat' && (t as { workspaceId?: string }).workspaceId !== activeWorkspaceId) continue;
      out.push({ id, terminal: t, aiStatus: findStatus(t.aiSessionId) });
    }
    return out;
  }, [terminals, tabMode, activeWorkspaceId, copilotSessions, claudeCodeSessions]);

  return (
    <>
      <div className="status-bar">
        <div className="status-section status-left">
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleHideTabTitles()}
            title={formatKeyForPlatform("Toggle Tab Bar (Ctrl+Shift+B)")}
          >
            &#9776; Tabs
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleDirPicker()}
            title={formatKeyForPlatform("Directories (Ctrl+Shift+D)")}
          >
            &#128193; Dirs
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleFileExplorer()}
            title={formatKeyForPlatform("File Explorer (Ctrl+Shift+X)")}
          >
            &#128196; Explorer
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleCopilotPanel()}
            title={formatKeyForPlatform("AI Sessions (Ctrl+Shift+C)")}
          >
            &#129302; Sessions
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleWorktreePanel()}
            title="Git Worktrees"
          >
            &#127793; Worktrees
          </button>
        </div>
        <div className="status-section status-center">
          {currentTip && (
            <span
              className="status-dim status-tip"
              title={currentTip.text}
            >
              💡 {currentTip.text}
            </span>
          )}
        </div>
        <div className="status-section status-right">
          {dormantTerminals.length > 0 && (
            <button
              className="status-mode-btn status-dormant-btn"
              onClick={(e) => {
                if (dormantPopoverOpen) {
                  setDormantPopoverOpen(false);
                  return;
                }
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                // Anchor the popover so its right edge aligns with the
                // button's right edge and its bottom sits just above the
                // button. Stays glued to the button no matter where in the
                // footer the button is laid out.
                setDormantPopoverAnchor({
                  right: window.innerWidth - r.right,
                  bottom: window.innerHeight - r.top + 4,
                });
                setDormantPopoverOpen(true);
              }}
              title={`${dormantTerminals.length} hidden pane${dormantTerminals.length === 1 ? '' : 's'} - click to wake`}
              aria-expanded={dormantPopoverOpen}
            >
              &#128065; {dormantTerminals.length} hidden &#9662;
            </button>
          )}
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleViewMode()}
            title="Toggle view mode (Ctrl+Shift+F)"
          >
            &#9638; {viewMode === 'focus' ? 'Focus' : viewMode === 'grid' ? (gridColumns ? `Grid ${gridColumns}col` : 'Grid') : 'Split'}
          </button>
          {broadcastMode && (
            <button
              className="status-mode-btn status-broadcast-active"
              onClick={() => useTerminalStore.getState().toggleBroadcastMode()}
              title="Broadcast is on - click to disable (Ctrl+Shift+A)"
            >
              &#128227; Broadcast ON
            </button>
          )}
          <button
            type="button"
            className="status-mode-btn status-terminal-count-btn"
            onClick={(e) => {
              if (terminalListOpen) {
                setTerminalListOpen(false);
                return;
              }
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              // Anchor right edge to the button's right edge, bottom just
              // above the button - same approach as the dormant popover.
              setTerminalListAnchor({
                right: window.innerWidth - r.right,
                bottom: window.innerHeight - r.top + 4,
              });
              setTerminalListOpen(true);
            }}
            title="Click to list every terminal with its mode and AI status"
            aria-expanded={terminalListOpen}
            aria-haspopup="dialog"
          >
            {totalCount} terminal{totalCount !== 1 ? 's' : ''}
            {floatingCount > 0 ? ` (${tiledCount} tiled, ${floatingCount} floating)` : ''}
          </button>
          <button
            className="status-mode-btn"
            onClick={() => setShowZoomDialog(true)}
            title={formatKeyForPlatform("Set zoom % (Ctrl++ / Ctrl+- to adjust, Ctrl+0 to reset)")}
          >
            {Math.round((fontSize / (config?.terminal?.fontSize ?? 14)) * 100)}%
          </button>
          {isDev && (
            <span className="status-dev-pill" title="Running from npm start (dev build, not the packaged app)">
              DEV
            </span>
          )}
          {updateInfo && updateInfo.status === 'downloading' ? (
            <span
              className="status-update-downloading"
              title={`Downloading update${updateInfo.latest ? ` v${updateInfo.latest}` : ''}...`}
            >
              &#10227; Updating{updateInfo.latest ? ` to v${updateInfo.latest}` : ''}
            </span>
          ) : updateInfo && (updateInfo.status === 'downloaded' || updateInfo.status === 'available') ? (
            <span
              className={updateInfo.status === 'downloaded' ? 'status-update-ready' : 'status-update-available'}
              onClick={() => setShowUpdateModal(true)}
              title={`Update ${updateInfo.status === 'downloaded' ? 'ready' : 'available'}: v${updateInfo.latest} (click for details)`}
            >
              v{appVersion} &rarr; v{updateInfo.latest}
            </span>
          ) : (
            <span className="status-dim" style={{ cursor: 'pointer' }} onClick={openChangelog} data-tooltip="View changelog">v{appVersion}</span>
          )}
          <button
            className="status-mode-btn status-overflow-btn"
            onClick={() => setOverflowOpen((v) => !v)}
            title="More options"
            aria-expanded={overflowOpen}
          >
            &#x22EF;
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleSettings()}
            title={formatKeyForPlatform("Settings (Ctrl+,)")}
            aria-label="Open Settings"
          >
            &#9881;
          </button>
          <button
            className="status-help-btn"
            onClick={() => useTerminalStore.getState().toggleCommandPalette()}
            title="Show command palette (Ctrl+Shift+P)"
          >
            &#9776;
          </button>
        </div>
      </div>
      {terminalListOpen && (
        <TerminalListPopover
          entries={terminalListEntries}
          anchor={terminalListAnchor}
          onClose={() => setTerminalListOpen(false)}
        />
      )}
      {dormantPopoverOpen && (
        <>
          <div className="dormant-popover-backdrop" onClick={() => setDormantPopoverOpen(false)} />
          <div
            className="dormant-popover"
            onClick={(e) => e.stopPropagation()}
            // Override the CSS default (bottom-left of viewport) with the
            // button's actual position so the popover sticks to the
            // 👁 hidden button.
            style={dormantPopoverAnchor ? {
              left: 'auto',
              bottom: dormantPopoverAnchor.bottom,
              right: dormantPopoverAnchor.right,
            } : undefined}
          >
            <div className="dormant-popover-header">
              <span>Hidden ({dormantTerminals.length})</span>
              {dormantTerminals.length > 1 && (
                <button
                  className="dormant-popover-wake-all"
                  onClick={() => {
                    const store = useTerminalStore.getState();
                    for (const t of dormantTerminals) store.wakeFromDormant(t.id);
                    setDormantPopoverOpen(false);
                  }}
                  title="Wake every hidden pane at once"
                >
                  Wake all
                </button>
              )}
            </div>
            {dormantTerminals.map((t) => (
              <button
                key={t.id}
                className="dormant-popover-item"
                onClick={() => {
                  useTerminalStore.getState().wakeFromDormant(t.id);
                  setDormantPopoverOpen(false);
                }}
                title={t.cwd}
              >
                <span className="dormant-popover-title">{t.title}</span>
                <span className="dormant-popover-cwd">
                  {t.cwd}
                  {t.lastProcess && t.lastProcess !== t.title ? (t.cwd ? ' · ' : '') + t.lastProcess : ''}
                  {t.pid ? (t.cwd || t.lastProcess ? ' · ' : '') + 'pid ' + t.pid : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {overflowOpen && (
        <>
          <div className="dormant-popover-backdrop" onClick={() => setOverflowOpen(false)} />
          <div className="context-menu status-overflow-menu" onClick={(e) => e.stopPropagation()}>
            <button
              className="context-menu-item"
              onClick={() => {
                useTerminalStore.getState().togglePromptSearch();
                setOverflowOpen(false);
              }}
              title="Search every pane's AI prompt history and jump to the match"
            >
              🔍 Search prompts
              <span className="context-menu-shortcut">Ctrl+Shift+Y</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                useTerminalStore.getState().toggleBroadcastMode();
                setOverflowOpen(false);
              }}
              title="Type into every tiled pane at once"
            >
              📢 Broadcast typing{broadcastMode ? ' ✓' : ''}
              <span className="context-menu-shortcut">Ctrl+Shift+A</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                useTerminalStore.getState().colorizeAllTabs();
                setOverflowOpen(false);
              }}
              title="Auto-assign a color to every tab based on its cwd"
            >
              🎨 Tab colors{hasAnyColor ? ' ✓' : ''}
              <span className="context-menu-shortcut">Ctrl+Shift+O</span>
            </button>
            <div className="context-menu-separator" />
            <button
              className="context-menu-item"
              onClick={() => {
                setOverflowOpen(false);
                openChangelog();
              }}
              title="See what changed in this version"
            >
              📜 Changelog
              <span className="context-menu-shortcut">v{appVersion}</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                window.terminalAPI.getDiagLogPath().then((p: string) => (window.terminalAPI as any).openPath(p));
                setOverflowOpen(false);
              }}
              title="Open the renderer/main diagnostics log file"
            >
              📋 Open diagnostics log
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                setShowReportModal(true);
                setOverflowOpen(false);
              }}
              title="File a GitHub issue with version + platform pre-filled"
            >
              ⚠️ Report an issue
            </button>
          </div>
        </>
      )}
      {showUpdateModal && updateInfo && (
        <UpdateModal info={updateInfo} appVersion={appVersion} onClose={() => setShowUpdateModal(false)} />
      )}
      {showChangelog && (
        <ChangelogModal content={changelogContent} loading={changelogLoading} onClose={() => setShowChangelog(false)} />
      )}
      {showZoomDialog && (
        <InputDialog
          title="Set Zoom (%)"
          placeholder={`Current: ${Math.round((fontSize / (config?.terminal?.fontSize ?? 14)) * 100)}% — enter 50-300`}
          onSubmit={(value) => {
            const pct = parseFloat(value);
            if (Number.isFinite(pct) && pct >= 50 && pct <= 300) {
              const baseline = config?.terminal?.fontSize ?? 14;
              const targetSize = Math.round((baseline * pct) / 100);
              const clamped = Math.max(8, Math.min(32, targetSize));
              useTerminalStore.setState({ fontSize: clamped });
            }
            setShowZoomDialog(false);
          }}
          onClose={() => setShowZoomDialog(false)}
        />
      )}
      {showReportModal && (
        <div className="update-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="update-modal" onClick={(e) => e.stopPropagation()}>
            <div className="update-modal-header">
              <h2>Report an Issue</h2>
              <button className="update-modal-close" onClick={() => setShowReportModal(false)}>&times;</button>
            </div>
            <div className="update-modal-notes">
              <p>Clicking <strong>Open GitHub</strong> opens the new-issue page in your browser with a prefilled template. The same template plus the last ~25 KB of your diagnostic log is copied to your clipboard - paste it into the issue body to give us the context we need. Review before submitting and remove any lines you don't want to share.</p>
              <p style={{ marginTop: '12px', color: 'var(--yellow)' }}>
                <strong>Important:</strong> Use your personal GitHub account, not your org/EMU account. EMU accounts are often blocked from commenting on public repos - if the page doesn't load, paste the template into a private/incognito window.
              </p>
            </div>
            <div className="update-modal-actions">
              <button className="update-modal-btn primary" onClick={submitReport}>Open GitHub</button>
              <button className="update-modal-btn" onClick={() => setShowReportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StatusBar;
