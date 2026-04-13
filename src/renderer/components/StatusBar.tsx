import React, { useEffect, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';
import { formatKeyForPlatform } from '../utils/platform';

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
    // Bullet lists
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Line breaks
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

const StatusBar: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoState | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [shownVersion, setShownVersion] = useState<string>('');

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

  const fontSize = useTerminalStore((s) => s.fontSize);
  const config = useTerminalStore((s) => s.config);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const gridColumns = useTerminalStore((s) => s.gridColumns);
  const hasAnyColor = useTerminalStore((s) => s.autoColorTabs);
  const hideTabBar = useTerminalStore((s) => s.hideTabTitles);
  const focused = focusedId ? terminals.get(focusedId) : null;
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
        </div>
        <div className="status-section status-right">
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().colorizeAllTabs()}
            title="Toggle tab colors (Ctrl+Shift+O)"
          >
            &#127912; {hasAnyColor ? 'Colors \u2713' : 'Colors'}
          </button>
          <button
            className="status-mode-btn"
            onClick={() => useTerminalStore.getState().toggleViewMode()}
            title="Toggle view mode (Ctrl+Shift+F)"
          >
            &#9638; {viewMode === 'focus' ? 'Focus' : viewMode === 'grid' ? (gridColumns ? `Grid ${gridColumns}col` : 'Grid') : 'Split'}
          </button>
          <span className="status-dim">
            {totalCount} terminal{totalCount !== 1 ? 's' : ''}
            {floatingCount > 0 ? ` (${tiledCount} tiled, ${floatingCount} floating)` : ''}
          </span>
          <span className="status-dim">{Math.round((fontSize / (config?.terminal?.fontSize ?? 14)) * 100)}%</span>
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
            <span className="status-dim">v{appVersion}</span>
          )}
          <button
            className="status-help-btn"
            onClick={() => {
              const body = encodeURIComponent(`**Version:** ${appVersion}\n**Platform:** ${navigator.platform}\n\n**Description:**\n\n\n**Steps to reproduce:**\n1. \n\n**Expected behavior:**\n\n**Actual behavior:**\n`);
              window.open(`https://github.com/InbarR/tmax/issues/new?body=${body}`, '_blank');
            }}
            title="Report an issue"
          >
            &#128027;
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
      {showUpdateModal && updateInfo && (
        <UpdateModal info={updateInfo} appVersion={appVersion} onClose={() => setShowUpdateModal(false)} />
      )}
    </>
  );
};

export default StatusBar;
