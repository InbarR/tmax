import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTerminalStore } from '../state/terminal-store';
import type { TerminalId } from '../state/types';

interface DropZoneProps {
  id: string;
  className: string;
  label: string;
}

const DropZone: React.FC<DropZoneProps> = ({ id, className, label }) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`pane-drop-zone ${className}${isOver ? ' active' : ''}`}
    >
      {isOver && <span className="drop-label">{label}</span>}
    </div>
  );
};

interface PaneDropZonesProps {
  terminalId: TerminalId;
}

const PaneDropZones: React.FC<PaneDropZonesProps> = ({ terminalId }) => {
  const isDragging = useTerminalStore((s) => s.isDragging);
  const draggedId = useTerminalStore((s) => s.draggedTerminalId);

  if (!isDragging || draggedId === terminalId) return null;

  return (
    <div className="pane-drop-zones-container">
      <DropZone id={`drop:${terminalId}:left`} className="zone-left" label="← Split Left" />
      <DropZone id={`drop:${terminalId}:right`} className="zone-right" label="Split Right →" />
      <DropZone id={`drop:${terminalId}:top`} className="zone-top" label="↑ Split Top" />
      <DropZone id={`drop:${terminalId}:bottom`} className="zone-bottom" label="Split Bottom ↓" />
      <DropZone id={`drop:${terminalId}:center`} className="zone-center" label="Swap" />
    </div>
  );
};

export default PaneDropZones;
