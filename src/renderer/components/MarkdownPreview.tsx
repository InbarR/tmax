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
const SAFE_IMG_URI_REGEX = /^(?:https:|data:image\/(?:apng|avif|png|jpeg|jpg|gif|webp|svg\+xml);|\/|\.\/|\.\.\/)/i;
const URI_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;
const TRANSPARENT_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

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

function encodePathSegments(pathValue: string): string {
  return pathValue
    .split('/')
    .map((segment) => (/^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/');
}

function pathToFileUrl(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return `file:${encodePathSegments(normalized)}`;
  return `file://${encodePathSegments(normalized.startsWith('/') ? normalized : `/${normalized}`)}`;
}

function fileUrlToPath(fileUrl: string): string {
  const url = new URL(fileUrl);
  const decodedPath = decodeURIComponent(url.pathname);
  if (url.host) return `//${url.host}${decodedPath}`;
  if (/^\/[a-zA-Z]:\//.test(decodedPath)) return decodedPath.slice(1).replace(/\//g, '\\');
  return decodedPath;
}

function resolveMarkdownImagePath(src: string, markdownFilePath: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || URI_SCHEME_REGEX.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return null;
  }

  const basePath = markdownFilePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '/');
  return fileUrlToPath(new URL(trimmed, pathToFileUrl(basePath)).toString());
}

function rewriteMarkdownImageSources(html: string, markdownFilePath: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    const localPath = resolveMarkdownImagePath(src, markdownFilePath);
    if (!localPath) return;
    img.setAttribute('data-md-local-src', localPath);
    img.setAttribute('src', TRANSPARENT_IMAGE_SRC);
  });
  return template.innerHTML;
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
  onClose: () => void;
  onOpenExternally?: (path: string) => void;
  /** Side to render on */
  side?: 'left' | 'right';
  onToggleSide?: () => void;
  width?: string;
}

type ViewMode = 'preview' | 'raw';

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
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const resizeListenersRef = useRef<{ onMouseMove: (ev: MouseEvent) => void; onMouseUp: () => void } | null>(null);

  const { zoomPercent, zoomIn, zoomOut, zoomReset, fontSize } = useZoom({ containerRef: overlayRef });

  const compiledHtml = useMemo(() => {
    if (!isMd || viewMode !== 'preview') return '';
    const rawHtml = marked(content, { breaks: true, gfm: true }) as string;
    return sanitizeHtml(rewriteMarkdownImageSources(rawHtml, filePath));
  }, [content, filePath, isMd, viewMode]);

  useEffect(() => {
    if (!contentRef.current || !isMd || viewMode !== 'preview') return;
    let cancelled = false;

    const loadImages = async () => {
      const images = Array.from(contentRef.current?.querySelectorAll<HTMLImageElement>('img[data-md-local-src]') || []);
      const fileReadDataUrl = (window.terminalAPI as any).fileReadDataUrl;
      if (typeof fileReadDataUrl !== 'function') return;

      for (const img of images) {
        const localPath = img.getAttribute('data-md-local-src');
        if (!localPath || cancelled || !img.isConnected) continue;
        try {
          const dataUrl = await fileReadDataUrl(localPath);
          if (!cancelled && img.isConnected && dataUrl) {
            img.src = dataUrl;
            img.removeAttribute('data-md-local-src');
          }
        } catch (err) {
          console.warn('Failed to load markdown image:', localPath, err);
        }
      }
    };

    void loadImages();
    return () => { cancelled = true; };
  }, [compiledHtml, isMd, viewMode]);

  // Render mermaid diagrams after HTML is injected
  useEffect(() => {
    if (!contentRef.current || !isMd || viewMode !== 'preview') return;
    let cancelled = false;

    const renderDiagrams = async () => {
      const codeBlocks = Array.from(contentRef.current?.querySelectorAll('code.language-mermaid') || []);
      for (const [idx, block] of codeBlocks.entries()) {
        const pre = block.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;
        const source = block.textContent || '';
        try {
          const { svg } = await mermaid.render(`mermaid-diagram-${idx}-${Date.now()}`, source);
          if (cancelled || !block.isConnected || !pre.isConnected) continue;
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.innerHTML = sanitizeSvg(svg);
          pre.replaceWith(wrapper);
        } catch {
          // If mermaid fails to parse, leave as code block
        }
      }
    };

    void renderDiagrams();
    return () => { cancelled = true; };
  }, [compiledHtml, isMd, viewMode]);

  const cleanupResize = useCallback(() => {
    const listeners = resizeListenersRef.current;
    if (listeners) {
      document.removeEventListener('mousemove', listeners.onMouseMove);
      document.removeEventListener('mouseup', listeners.onMouseUp);
      resizeListenersRef.current = null;
    }
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => cleanupResize, [cleanupResize]);

  // Drag-to-resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    cleanupResize();
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

    const onMouseUp = () => cleanupResize();

    resizeListenersRef.current = { onMouseMove, onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [cleanupResize, side]);

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
        {isMd && viewMode === 'preview' ? (
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
