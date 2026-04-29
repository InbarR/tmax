import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import { useZoom } from '../hooks/useZoom';
import ZoomControls from './ZoomControls';

// Initialize mermaid with dark theme matching the app
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#89b4fa',
    primaryTextColor: '#cdd6f4',
    primaryBorderColor: '#45475a',
    lineColor: '#a6adc8',
    secondaryColor: '#313244',
    tertiaryColor: '#1e1e2e',
  },
});

interface MarkdownPreviewProps {
  content: string;
  fileName: string;
  filePath: string;
  onClose: () => void;
  onOpenExternally?: (path: string) => void;
  /** Side to render on */
  side?: 'left' | 'right';
  onToggleSide?: () => void;
  width?: string;
}

type ViewMode = 'friendly' | 'raw';

const DEFAULT_WIDTH_PERCENT = 50;
const MIN_WIDTH_PX = 300;

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  fileName,
  filePath,
  onClose,
  onOpenExternally,
  side = 'right',
  onToggleSide,
  width,
}) => {
  const isMd = /\.md$/i.test(fileName);
  const [viewMode, setViewMode] = useState<ViewMode>('friendly');
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const { zoomPercent, zoomIn, zoomOut, zoomReset, fontSize } = useZoom({ containerRef: overlayRef });

  const compiledHtml = useMemo(() => {
    if (!isMd || viewMode !== 'friendly') return '';
    return marked(content, { breaks: true, gfm: true }) as string;
  }, [content, isMd, viewMode]);

  // Render mermaid diagrams after HTML is injected
  useEffect(() => {
    if (!contentRef.current || !isMd || viewMode !== 'friendly') return;
    const codeBlocks = contentRef.current.querySelectorAll('code.language-mermaid');
    codeBlocks.forEach(async (block, idx) => {
      const pre = block.parentElement;
      if (!pre || pre.tagName !== 'PRE') return;
      const source = block.textContent || '';
      try {
        const { svg } = await mermaid.render(`mermaid-diagram-${idx}-${Date.now()}`, source);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch {
        // If mermaid fails to parse, leave as code block
      }
    });
  }, [compiledHtml, isMd, viewMode]);

  // Drag-to-resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const windowWidth = window.innerWidth;
      let newWidth: number;
      if (side === 'right') {
        newWidth = windowWidth - ev.clientX;
      } else {
        newWidth = ev.clientX;
      }
      newWidth = Math.max(MIN_WIDTH_PX, Math.min(newWidth, windowWidth - 100));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [side]);

  const resolvedWidth = panelWidth != null ? `${panelWidth}px` : (width || `${DEFAULT_WIDTH_PERCENT}%`);

  return (
    <div
      ref={overlayRef}
      className={`file-preview-overlay ${side}`}
      style={{ width: resolvedWidth }}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="file-preview-resize" onMouseDown={handleResizeMouseDown} />
      <div className="file-preview-sidebar">
        <div className="file-preview-header">
          <span className="file-preview-name">{fileName}</span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {isMd && (
              <div className="md-view-toggle">
                <button
                  type="button"
                  className={`md-view-toggle-btn${viewMode === 'friendly' ? ' active' : ''}`}
                  onClick={() => setViewMode('friendly')}
                  title="Rendered markdown"
                >
                  Friendly
                </button>
                <button
                  type="button"
                  className={`md-view-toggle-btn${viewMode === 'raw' ? ' active' : ''}`}
                  onClick={() => setViewMode('raw')}
                  title="Raw source"
                >
                  Raw
                </button>
              </div>
            )}
            <ZoomControls zoomPercent={zoomPercent} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} />
            {onOpenExternally && (
              <button className="file-preview-btn" onClick={() => onOpenExternally(filePath)} title="Open externally">&#8599;</button>
            )}
            {onToggleSide && (
              <button className="file-preview-btn" onClick={onToggleSide} title="Move to other side">
                {side === 'right' ? '\u25C0' : '\u25B6'}
              </button>
            )}
            <button className="file-preview-btn close" onClick={onClose} title="Close (Esc)">&#10005;</button>
          </div>
        </div>
        {isMd && viewMode === 'friendly' ? (
          <div
            ref={contentRef}
            className="md-rendered-content"
            style={{ fontSize: fontSize(14) }}
            dangerouslySetInnerHTML={{ __html: compiledHtml }}
          />
        ) : (
          <pre className="file-preview-content" style={{ fontSize: fontSize(14) }}>{content}</pre>
        )}
      </div>
    </div>
  );
};

export default MarkdownPreview;
