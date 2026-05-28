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

  // Re-read the underlying file from disk and refresh the preview. Only
  // wired for markdown previews — image previews fetch their bytes
  // internally in MarkdownPreview via a separate IPC and don't flow
  // through this store slot's `content` field.
  const handleReload = async () => {
    const current = useTerminalStore.getState().markdownPreview;
    if (!current || current.kind === 'image') return;
    try {
      const fresh = await (window.terminalAPI as any).fileRead(current.filePath);
      if (typeof fresh !== 'string') return;
      const latest = useTerminalStore.getState().markdownPreview;
      // Don't clobber if the user closed or switched files mid-reload.
      if (!latest || latest.filePath !== current.filePath) return;
      useTerminalStore.setState({
        markdownPreview: { ...latest, content: fresh },
      });
    } catch {
      // Match md-link-parser behavior: swallow read errors silently.
    }
  };

  const isImage = markdownPreview.kind === 'image';

  return ReactDOM.createPortal(
    <MarkdownPreview
      content={markdownPreview.content}
      fileName={markdownPreview.fileName}
      filePath={markdownPreview.filePath}
      kind={markdownPreview.kind}
      onClose={handleClose}
      onOpenExternally={handleOpenExternally}
      onReload={isImage ? undefined : handleReload}
      side={side}
      onToggleSide={() => setSide((s) => s === 'right' ? 'left' : 'right')}
    />,
    document.body,
  );
};

export default MarkdownPreviewOverlay;
