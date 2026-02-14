import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import FloatingPanel from './FloatingPanel';

const FloatingLayer: React.FC = () => {
  const floatingPanels = useTerminalStore((s) => s.layout.floatingPanels);

  return (
    <div className="floating-layer">
      {floatingPanels.map((panel) => (
        <FloatingPanel key={panel.terminalId} panel={panel} />
      ))}
    </div>
  );
};

export default FloatingLayer;
