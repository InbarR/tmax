import React, { useCallback, useRef, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { SplitDirection } from '../state/types';

/** Minimum pane size in pixels to prevent unusable narrow terminals */
const MIN_PANE_PX = 120;

interface SplitResizerProps {
  splitNodeId: string;
  direction: SplitDirection;
}

const SplitResizer: React.FC<SplitResizerProps> = ({
  splitNodeId,
  direction,
}) => {
  const [dragging, setDragging] = useState(false);
  const startPosRef = useRef(0);
  const startRatioRef = useRef(0);
  const parentSizeRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parentEl = (e.target as HTMLElement).parentElement;
      if (!parentEl) return;

      const parentRect = parentEl.getBoundingClientRect();
      parentSizeRef.current =
        direction === 'horizontal' ? parentRect.width : parentRect.height;
      startPosRef.current =
        direction === 'horizontal' ? e.clientX : e.clientY;

      // Read current ratio from store
      const store = useTerminalStore.getState();
      const findRatio = (
        node: typeof store.layout.tilingRoot
      ): number | null => {
        if (!node || node.kind === 'leaf') return null;
        if (node.id === splitNodeId) return node.splitRatio;
        return findRatio(node.first) ?? findRatio(node.second);
      };
      startRatioRef.current = findRatio(store.layout.tilingRoot) ?? 0.5;
      setDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos =
          direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const deltaPx = currentPos - startPosRef.current;
        const deltaRatio = deltaPx / parentSizeRef.current;
        const newRatio = startRatioRef.current + deltaRatio;
        // Pixel-aware clamp: keep each pane ≥ MIN_PANE_PX
        const minRatio = parentSizeRef.current > 0
          ? MIN_PANE_PX / parentSizeRef.current
          : 0.1;
        const clamped = Math.max(minRatio, Math.min(1 - minRatio, newRatio));
        useTerminalStore.getState().setSplitRatio(splitNodeId, clamped);
      };

      const handleMouseUp = () => {
        setDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [splitNodeId, direction]
  );

  const handleDoubleClick = useCallback(() => {
    useTerminalStore.getState().setSplitRatio(splitNodeId, 0.5);
  }, [splitNodeId]);

  const className = [
    'split-resizer',
    direction,
    dragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    />
  );
};

export default SplitResizer;
