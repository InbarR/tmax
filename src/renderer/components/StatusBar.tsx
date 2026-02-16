import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';

const StatusBar: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const layout = useTerminalStore((s) => s.layout);

  const fontSize = useTerminalStore((s) => s.fontSize);
  const config = useTerminalStore((s) => s.config);
  const focusModeTerminalId = useTerminalStore((s) => s.focusModeTerminalId);
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
              {focusModeTerminalId === focusedId ? '(focus mode)' : ''}
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
        <span className="status-dim">
          {totalCount} terminal{totalCount !== 1 ? 's' : ''}
          {floatingCount > 0 ? ` (${tiledCount} tiled, ${floatingCount} floating)` : ''}
        </span>
        <span className="status-dim">{Math.round((fontSize / (config?.terminal?.fontSize ?? 14)) * 100)}%</span>
        <span className="status-dim">v1.0.0</span>
        <button
          className="status-help-btn"
          onClick={() => useTerminalStore.getState().toggleShortcuts()}
          title="Show keyboard shortcuts (Ctrl+Shift+?)"
        >
          ?
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
