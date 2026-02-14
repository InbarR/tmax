import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { getLeafOrder } from '../state/terminal-store';

const StatusBar: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const layout = useTerminalStore((s) => s.layout);

  const fontSize = useTerminalStore((s) => s.fontSize);
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
            <span className="status-dim">{focused.mode === 'floating' ? '(floating)' : ''}</span>
          </>
        ) : (
          <span className="status-dim">No terminal focused</span>
        )}
      </div>
      <div className="status-section status-center">
        {focused && (
          <span className="status-dim">{focused.cwd}</span>
        )}
      </div>
      <div className="status-section status-right">
        <span className="status-dim">
          {totalCount} terminal{totalCount !== 1 ? 's' : ''}
          {floatingCount > 0 ? ` (${tiledCount} tiled, ${floatingCount} floating)` : ''}
        </span>
        <span className="status-dim">{fontSize}px</span>
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
