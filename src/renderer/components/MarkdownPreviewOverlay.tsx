import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTerminalStore } from '../state/terminal-store';
import MarkdownPreview from './MarkdownPreview';

/**
 * Global overlay that renders when markdownPreview state is set.
 * Triggered from Terminal link provider, Copilot Panel, or any other source.
 */
const MarkdownPreviewOverlay: React.FC = () => {
  const markdownPreview = useTerminalStore((s) => s.markdownPreview);
  const [side, setSide] = useState<'left' | 'right'>('right');

  if (!markdownPreview) return null;

  const handleClose = () => {
    useTerminalStore.setState({ markdownPreview: null });
  };

  const handleOpenExternally = (path: string) => {
    (window.terminalAPI as any).openPath(path);
  };

  return ReactDOM.createPortal(
    <MarkdownPreview
      content={markdownPreview.content}
      fileName={markdownPreview.fileName}
      filePath={markdownPreview.filePath}
      kind={markdownPreview.kind}
      onClose={handleClose}
      onOpenExternally={handleOpenExternally}
      side={side}
      onToggleSide={() => setSide((s) => s === 'right' ? 'left' : 'right')}
    />,
    document.body,
  );
};

export default MarkdownPreviewOverlay;
