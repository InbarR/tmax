import React from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { formatKeyForPlatform, hasPrimaryMod } from './platform';

// Regex matching file paths ending in .md
const MD_PATH_REGEX = /(?:[a-zA-Z]:[\\/]|[\/~.])?[^\s"'`<>|:*?]*\.md\b/g;

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:/.test(p) || p.startsWith('/') || p.startsWith('~');
}

function resolveRelativePath(path: string, cwd: string): string {
  if (isAbsolutePath(path)) return path;
  const sep = cwd.includes('\\') ? '\\' : '/';
  return cwd.replace(/[\\/]$/, '') + sep + path;
}

/**
 * Parse text and replace .md file paths with clickable elements.
 * On primary-modifier click, reads the file and opens the markdown preview.
 * @param cwd — optional working directory to resolve relative paths against
 */
export function renderWithMdLinks(text: string, cwd?: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MD_PATH_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const rawPath = match[0];
    parts.push(
      <span
        key={match.index}
        className="md-file-link"
        onClick={(e) => {
          if (hasPrimaryMod(e)) {
            e.preventDefault();
            e.stopPropagation();
            // Resolve relative paths using provided cwd, or fall back to focused terminal cwd
            const resolveCwd = cwd
              || useTerminalStore.getState().terminals.get(useTerminalStore.getState().focusedTerminalId || '')?.cwd
              || '';
            const fullPath = resolveRelativePath(rawPath, resolveCwd);
            (window.terminalAPI as any).fileRead(fullPath).then((content: string | null) => {
              if (content !== null) {
                const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
                useTerminalStore.setState({ markdownPreview: { filePath: fullPath, content, fileName } });
              }
            });
          }
        }}
        title={formatKeyForPlatform('Ctrl+Click to preview')}
      >
        {rawPath}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return text;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}
