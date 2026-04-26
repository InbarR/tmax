import React, { useEffect, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';
import { formatKeyForPlatform } from '../utils/platform';
import InputDialog from './InputDialog';

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

function renderMarkdown(md: string): string {
  return escapeHtml(md)
    // Headings
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
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
    .replace(/\n*(<\/?(?:h[1-6]|ul|li|p)>)\n*/g, '$1')
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
          ) : info.url ? (
            <button className="update-modal-btn primary" onClick={() => window.open(info.url, '_blank')}>
              Download
            </button>
          ) : null}
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
          <button className="update-modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
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

  const submitReport = () => {
    const issueBody = `**Version:** ${appVersion}\n**Platform:** ${navigator.platform}\n\n**Description:**\n\n\n**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**\n`;
    const url = `https://github.com/InbarR/tmax/issues/new?body=${encodeURIComponent(issueBody)}`;
    window.terminalAPI.clipboardWrite(issueBody);
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
    const out: { id: string; title: string; cwd: string }[] = [];
    for (const [id, t] of terminals) {
      if (t.mode === 'dormant') out.push({ id, title: t.title || 'Terminal', cwd: t.cwd || '' });
    }
    return out;
  }, [terminals]);
  const [dormantPopoverOpen, setDormantPopoverOpen] = useState(false);
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
  // When the focused pane is an AI session waiting for user input, surface
  // a quiet Ctrl+U hint - Claude Code / Copilot CLI eat Ctrl+C as a turn
  // interrupt, but Ctrl+U cleanly clears the input line. Hint disappears
  // once the agent goes thinking/idle so the footer doesn't keep yelling.
  const focusedAiSession = useTerminalStore((s) => {
    if (!focused?.aiSessionId) return null;
    return (
      s.claudeCodeSessions.find((x) => x.id === focused.aiSessionId) ||
      s.copilotSessions.find((x) => x.id === focused.aiSessionId) ||
      null
    );
  });
  const showCtrlUHint =
    !!focusedAiSession &&
    (focusedAiSession.status === 'waitingForUser' || focusedAiSession.status === 'idle');
  const totalCount = terminals.size;
  const tiledCount = layout.tilingRoot ? getLeafOrder(layout.tilingRoot).length : 0;
  const floatingCount = layout.floatingPanels.length;

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
            title={formatKeyForPlatform("Git Worktrees (Ctrl+Shift+T)")}
          >
            &#127793; Worktrees
          </button>
          {dormantTerminals.length > 0 && (
            <button
              className="status-mode-btn status-dormant-btn"
              onClick={() => setDormantPopoverOpen((v) => !v)}
              title={`${dormantTerminals.length} hidden pane${dormantTerminals.length === 1 ? '' : 's'} - click to wake`}
              aria-expanded={dormantPopoverOpen}
            >
              &#128065; {dormantTerminals.length} hidden &#9662;
            </button>
          )}
          {focused ? (
            <>
              <span className="status-indicator" />
              <span className="status-label">{focused.title}</span>
              <span className="status-dim">
                {focused.mode === 'floating' ? '(floating)' : ''}
              </span>
            </>
          ) : (
            <span className="status-dim">No terminal focused</span>
          )}
        </div>
        <div className="status-section status-center">
          {focused && (
            <span
              className="status-cwd"
              onClick={() => {
                if (focused.cwd) {
                  window.terminalAPI.openPath(focused.cwd);
                }
              }}
              title="Open folder"
            >
              &#128193; {focused.cwd}
            </span>
          )}
          {showCtrlUHint && (
            <span
              className="status-dim status-ctrl-u-hint"
              title="In Claude Code / Copilot CLI, Ctrl+U clears the input line. Ctrl+C interrupts the agent's current turn instead - use Ctrl+U if you just want to clear what you typed."
            >
              {'  '}Ctrl+U: clear input
            </span>
          )}
        </div>
        <div className="status-section status-right">
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleViewMode()}
            title="Toggle view mode (Ctrl+Shift+F)"
          >
            &#9638; {viewMode === 'focus' ? 'Focus' : viewMode === 'grid' ? (gridColumns ? `Grid ${gridColumns}col` : 'Grid') : 'Split'}
          </button>
          <button
            className={`status-mode-btn${broadcastMode ? ' status-broadcast-active' : ''}`}
            onClick={() => useTerminalStore.getState().toggleBroadcastMode()}
            title="Broadcast typing to all panes (Ctrl+Shift+A)"
          >
            &#128227; Broadcast{broadcastMode ? ' ON' : ''}
          </button>
          <span className="status-dim">
            {totalCount} terminal{totalCount !== 1 ? 's' : ''}
            {floatingCount > 0 ? ` (${tiledCount} tiled, ${floatingCount} floating)` : ''}
          </span>
          <button
            className="status-mode-btn"
            onClick={() => setShowZoomDialog(true)}
            title={formatKeyForPlatform("Set zoom % (Ctrl++ / Ctrl+- to adjust, Ctrl+0 to reset)")}
          >
            {Math.round((fontSize / (config?.terminal?.fontSize ?? 14)) * 100)}%
          </button>
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
            className="status-help-btn"
            onClick={() => useTerminalStore.getState().toggleCommandPalette()}
            title="Show command palette (Ctrl+Shift+P)"
          >
            &#9776;
          </button>
        </div>
      </div>
      {dormantPopoverOpen && (
        <>
          <div className="dormant-popover-backdrop" onClick={() => setDormantPopoverOpen(false)} />
          <div className="dormant-popover" onClick={(e) => e.stopPropagation()}>
            <div className="dormant-popover-header">
              Hidden panes ({dormantTerminals.length}) - click to wake
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
                {t.cwd && <span className="dormant-popover-cwd">{t.cwd}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      {overflowOpen && (
        <>
          <div className="dormant-popover-backdrop" onClick={() => setOverflowOpen(false)} />
          <div className="status-overflow-popover" onClick={(e) => e.stopPropagation()}>
            <button
              className="dormant-popover-item"
              onClick={() => {
                useTerminalStore.getState().colorizeAllTabs();
                setOverflowOpen(false);
              }}
            >
              <span className="dormant-popover-title">🎨 {hasAnyColor ? 'Tab colors ✓' : 'Tab colors'}</span>
              <span className="dormant-popover-cwd">Ctrl+Shift+O</span>
            </button>
            <button
              className="dormant-popover-item"
              onClick={() => {
                window.terminalAPI.getDiagLogPath().then((p: string) => (window.terminalAPI as any).openPath(p));
                setOverflowOpen(false);
              }}
            >
              <span className="dormant-popover-title">📋 Open diagnostics log</span>
            </button>
            <button
              className="dormant-popover-item"
              onClick={() => {
                setShowReportModal(true);
                setOverflowOpen(false);
              }}
            >
              <span className="dormant-popover-title">⚠️ Report an issue</span>
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
              <p>Clicking <strong>Open GitHub</strong> will open the new-issue page in your browser. A prefilled issue template is also copied to your clipboard.</p>
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
