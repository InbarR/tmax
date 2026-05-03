import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { useZoom } from '../hooks/useZoom';
import ZoomControls from './ZoomControls';

// Restrict link/image URI schemes to safe ones. Markdown files can be untrusted
// (cloned repos, downloaded notes), and a renderer XSS in this Electron app would
// have access to the privileged window.terminalAPI bridge — i.e. arbitrary shell
// command execution. DOMPurify strips raw <script>, event handlers, javascript:
// URIs, etc. We additionally enforce an href/src scheme allowlist below.
const SAFE_URI_REGEX = /^(?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;
const SAFE_IMG_URI_REGEX = /^(?:https?:|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);|\/|\.\/|\.\.\/)/i;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href');
    if (href && !SAFE_URI_REGEX.test(href.trim())) {
      node.removeAttribute('href');
    }
    // Force safe link behavior for any remaining anchors.
    if (node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src');
    if (src && !SAFE_IMG_URI_REGEX.test(src.trim())) {
      node.removeAttribute('src');
    }
  }
});

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
    FORBID_ATTR: ['style'],
  });
}

function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
  });
}

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
  /** Discriminator. 'image' renders an <img> instead of markdown. Defaults to 'md'. */
  kind?: 'md' | 'image';
  onClose: () => void;
  onOpenExternally?: (path: string) => void;
  /** Side to render on */
  side?: 'left' | 'right';
  onToggleSide?: () => void;
  width?: string;
}

type ViewMode = 'preview' | 'raw';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|webp)$/i;

const DEFAULT_WIDTH_PERCENT = 50;
const MIN_WIDTH_PX = 300;

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  fileName,
  filePath,
  kind,
  onClose,
  onOpenExternally,
  side = 'right',
  onToggleSide,
  width,
}) => {
  const isImage = kind === 'image' || IMAGE_EXT_RE.test(fileName);
  const isMd = !isImage && /\.md$/i.test(fileName);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    setImageDataUrl(null);
    setImageError(null);
    (window.terminalAPI as unknown as { imageReadAsDataUrl: (p: string) => Promise<string | null> })
      .imageReadAsDataUrl(filePath)
      .then((url) => {
        if (cancelled) return;
        if (url) setImageDataUrl(url);
        else setImageError('File not found or unsupported format.');
      })
      .catch((err: unknown) => {
        if (!cancelled) setImageError(err instanceof Error ? err.message : 'Failed to read image.');
      });
    return () => { cancelled = true; };
  }, [isImage, filePath]);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const { zoomPercent, zoomIn, zoomOut, zoomReset, fontSize } = useZoom({ containerRef: overlayRef });

  const compiledHtml = useMemo(() => {
    if (!isMd || viewMode !== 'preview') return '';
    const rawHtml = marked(content, { breaks: true, gfm: true }) as string;
    return sanitizeHtml(rawHtml);
  }, [content, isMd, viewMode]);

  // Render mermaid diagrams after HTML is injected
  useEffect(() => {
    if (!contentRef.current || !isMd || viewMode !== 'preview') return;
    const codeBlocks = contentRef.current.querySelectorAll('code.language-mermaid');
    codeBlocks.forEach(async (block, idx) => {
      const pre = block.parentElement;
      if (!pre || pre.tagName !== 'PRE') return;
      const source = block.textContent || '';
      try {
        const { svg } = await mermaid.render(`mermaid-diagram-${idx}-${Date.now()}`, source);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = sanitizeSvg(svg);
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
                  className={`md-view-toggle-btn${viewMode === 'preview' ? ' active' : ''}`}
                  onClick={() => setViewMode('preview')}
                  title="Rendered markdown"
                >
                  Preview
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
        {isImage ? (
          <div className="image-preview-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', flex: 1, padding: 12 }}>
            {imageError ? (
              <div style={{ color: '#f38ba8', fontSize: 13, textAlign: 'center' }}>
                <div>{imageError}</div>
                <div style={{ opacity: 0.7, marginTop: 8, wordBreak: 'break-all' }}>{filePath}</div>
              </div>
            ) : imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt={fileName}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoomPercent / 100})`, transformOrigin: 'center center' }}
              />
            ) : (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Loading…</div>
            )}
          </div>
        ) : isMd && viewMode === 'preview' ? (
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
