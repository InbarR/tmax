import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import FloatingPanel from './FloatingPanel';

const FloatingLayer: React.FC = () => {
  const floatingPanels = useTerminalStore((s) => s.layout.floatingPanels);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);

  // Hide floating panels when a tiled terminal is focused
  const focusedInstance = focusedTerminalId ? terminals.get(focusedTerminalId) : null;
  const hidePanels = focusedInstance?.mode === 'tiled';

  return (
    <div className="floating-layer" style={hidePanels ? { visibility: 'hidden' } : undefined}>
      {floatingPanels.map((panel) => (
        <FloatingPanel key={panel.terminalId} panel={panel} />
      ))}
    </div>
  );
};

export default FloatingLayer;
