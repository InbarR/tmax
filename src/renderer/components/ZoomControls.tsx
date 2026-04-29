import React from 'react';
import { formatKeyForPlatform } from '../utils/platform';

interface ZoomControlsProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ zoomPercent, onZoomIn, onZoomOut, onZoomReset }) => (
  <div className="md-zoom-controls">
    <button type="button" className="file-preview-btn" onClick={onZoomOut} title={formatKeyForPlatform('Zoom out (Ctrl+Scroll down)')}>−</button>
    <span
      className="md-zoom-label"
      onClick={onZoomReset}
      title="Reset zoom"
    >
      {zoomPercent}%
    </span>
    <button type="button" className="file-preview-btn" onClick={onZoomIn} title={formatKeyForPlatform('Zoom in (Ctrl+Scroll up)')}>+</button>
  </div>
);

export default ZoomControls;
