import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTerminalStore } from '../state/terminal-store';

const DropZoneOverlay: React.FC = () => {
  const isDragging = useTerminalStore((s) => s.isDragging);
  const { isOver, setNodeRef } = useDroppable({ id: 'drop:float' });

  if (!isDragging) return null;

  return (
    <div className="drop-zone-overlay">
      <div
        ref={setNodeRef}
        className={`drop-zone-float${isOver ? ' active' : ''}`}
      />
    </div>
  );
};

export default DropZoneOverlay;
