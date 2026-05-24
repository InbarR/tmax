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

  // GH #115: a stuck React drag flag must not leave invisible
  // overlays swallowing wheel + mousedown on the pane. The container always
  // sets data-dragging based on the live store flag; per-zone CSS picks up
  // pointer-events: auto only while that attribute is "true". As an
  // additional safety net the four edge/center zones are not even rendered
  // unless a drag is active - so the worst-case bug surface (a stuck flag)
  // is "no drop targets" rather than "pane is dead".
  const dragActive = isDragging && draggedId !== terminalId;

  return (
    <div
      className="pane-drop-zones-container"
      data-dragging={dragActive ? 'true' : 'false'}
    >
      {dragActive && (
        <>
          <DropZone id={`drop:${terminalId}:left`} className="zone-left" label="← Split Left" />
          <DropZone id={`drop:${terminalId}:right`} className="zone-right" label="Split Right →" />
          <DropZone id={`drop:${terminalId}:top`} className="zone-top" label="↑ Split Top" />
          <DropZone id={`drop:${terminalId}:bottom`} className="zone-bottom" label="Split Bottom ↓" />
          <DropZone id={`drop:${terminalId}:center`} className="zone-center" label="Swap" />
        </>
      )}
    </div>
  );
};

export default PaneDropZones;
