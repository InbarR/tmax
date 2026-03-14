import React, { useEffect, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';

const StatusBar: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<{ status: string; current: string; latest?: string; url?: string } | null>(null);

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
  const terminals = useTerminalStore((s) => s.terminals);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const layout = useTerminalStore((s) => s.layout);

  const fontSize = useTerminalStore((s) => s.fontSize);
  const config = useTerminalStore((s) => s.config);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const gridColumns = useTerminalStore((s) => s.gridColumns);
  const hasAnyColor = useTerminalStore((s) => s.autoColorTabs);
  const focused = focusedId ? terminals.get(focusedId) : null;
  const totalCount = terminals.size;
  const tiledCount = layout.tilingRoot ? getLeafOrder(layout.tilingRoot).length : 0;
  const floatingCount = layout.floatingPanels.length;

  return (
    <div className="status-bar">
      <div className="status-section status-left">
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
          [{hasAnyColor ? 'Colors ✓' : 'Colors'} Ctrl+Shift+O]
        </button>
        <button
          className="status-mode-btn"
          onClick={() => useTerminalStore.getState().toggleViewMode()}
          title="Toggle view mode (Ctrl+Shift+F)"
        >
          [{viewMode === 'focus' ? 'Focus' : viewMode === 'grid' ? (gridColumns ? `Grid ${gridColumns}col` : 'Grid') : 'Split'} Ctrl+Shift+F]
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
            ⟳ Updating{updateInfo.latest ? ` to v${updateInfo.latest}` : ''}
          </span>
        ) : updateInfo && updateInfo.status === 'downloaded' ? (
          <span
            className="status-update-ready"
            onClick={() => window.terminalAPI.restartAndUpdate()}
            title="Click to restart and apply update"
          >
            v{appVersion} → v{updateInfo.latest} ↻
          </span>
        ) : updateInfo && updateInfo.status === 'available' && updateInfo.url ? (
          <span
            className="status-update-available"
            onClick={() => window.open(updateInfo.url, '_blank')}
            title={`Update available: v${updateInfo.latest} (click to download)`}
          >
            v{appVersion} → v{updateInfo.latest}
          </span>
        ) : (
          <span className="status-dim">v{appVersion}</span>
        )}
        <button
          className="status-help-btn"
          onClick={() => useTerminalStore.getState().toggleCommandPalette()}
          title="Show command palette (Ctrl+Shift+P)"
        >
          &#9776;
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
