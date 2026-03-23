import React from 'react';
import { useDroppable } from '@dnd-kit/core';
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
          minWidth: isHorizontal ? 120 : undefined,
          minHeight: !isHorizontal ? 60 : undefined,
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
          minWidth: isHorizontal ? 120 : undefined,
          minHeight: !isHorizontal ? 60 : undefined,
        }}
      >
        <TilingNode node={splitNode.second} />
      </div>
    </div>
  );
};

/** Thin drop zone on the edge of the layout area for full-height/width drops */
const RootEdgeZone: React.FC<{ side: string; className: string; label: string }> = ({ side, className, label }) => {
  const { isOver, setNodeRef } = useDroppable({ id: `drop:root:${side}` });
  return (
    <div ref={setNodeRef} className={`root-edge-zone ${className}${isOver ? ' active' : ''}`}>
      {isOver && <span className="drop-label">{label}</span>}
    </div>
  );
};

const RootDropZones: React.FC = () => {
  const isDragging = useTerminalStore((s) => s.isDragging);
  if (!isDragging) return null;
  return (
    <>
      <RootEdgeZone side="left" className="root-zone-left" label="← Full Left" />
      <RootEdgeZone side="right" className="root-zone-right" label="Full Right →" />
      <RootEdgeZone side="top" className="root-zone-top" label="↑ Full Top" />
      <RootEdgeZone side="bottom" className="root-zone-bottom" label="Full Bottom ↓" />
    </>
  );
};

const TilingLayout: React.FC = () => {
  const tilingRoot = useTerminalStore((s) => s.layout.tilingRoot);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);

  if (!tilingRoot) {
    return (
      <div className="empty-state">
        Press Ctrl+Shift+N to create a new terminal
      </div>
    );
  }

  // Always render a stable wrapper div so React never unmounts the TilingNode tree
  // on mode changes. Changing the root element type (div vs TilingNode) would cause
  // a full remount, destroying xterm instances and losing input focus.
  // In focus mode the CSS class hides non-focused panes via visibility tricks.
  // In normal mode display:contents makes the wrapper transparent to layout.
  return (
    <div className={viewMode === 'focus' ? 'tiling-focus-mode' : 'tiling-normal-mode'}>
      <TilingNode node={tilingRoot} />
      <RootDropZones />
    </div>
  );
};

export default TilingLayout;
