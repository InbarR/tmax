import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { LayoutNode, LayoutSplitNode } from '../state/types';
import TerminalPanel from './TerminalPanel';
import SplitResizer from './SplitResizer';
import PaneDropZones from './PaneDropZones';

interface TilingNodeProps {
  node: LayoutNode;
}

const TilingNode: React.FC<TilingNodeProps> = ({ node }) => {
  if (node.kind === 'leaf') {
    return (
      <div className="tiling-leaf">
        <TerminalPanel terminalId={node.terminalId} />
        <PaneDropZones terminalId={node.terminalId} />
      </div>
    );
  }

  const splitNode = node as LayoutSplitNode;
  const isHorizontal = splitNode.direction === 'horizontal';
  const firstBasis = `${splitNode.splitRatio * 100}%`;
  const secondBasis = `${(1 - splitNode.splitRatio) * 100}%`;

  return (
    <div className={`split-container ${splitNode.direction}`}>
      <div
        style={{
          flexBasis: firstBasis,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          minWidth: isHorizontal ? 0 : undefined,
          minHeight: !isHorizontal ? 0 : undefined,
        }}
      >
        <TilingNode node={splitNode.first} />
      </div>
      <SplitResizer
        splitNodeId={splitNode.id}
        direction={splitNode.direction}
      />
      <div
        style={{
          flexBasis: secondBasis,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          minWidth: isHorizontal ? 0 : undefined,
          minHeight: !isHorizontal ? 0 : undefined,
        }}
      >
        <TilingNode node={splitNode.second} />
      </div>
    </div>
  );
};

const TilingLayout: React.FC = () => {
  const tilingRoot = useTerminalStore((s) => s.layout.tilingRoot);
  const focusModeTerminalId = useTerminalStore((s) => s.focusModeTerminalId);

  if (!tilingRoot) {
    return (
      <div className="empty-state">
        Press Ctrl+Shift+N to create a new terminal
      </div>
    );
  }

  if (focusModeTerminalId) {
    return (
      <div className="tiling-leaf">
        <TerminalPanel terminalId={focusModeTerminalId} />
      </div>
    );
  }

  return <TilingNode node={tilingRoot} />;
};

export default TilingLayout;
