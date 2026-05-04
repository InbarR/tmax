import React from 'react';
import { useTerminalStore } from '../state/terminal-store';

// Regex matching file paths ending in .md.
//
// Two alternatives, tried in order at each position:
//   1. Anchored at a real path prefix (Windows drive `C:\`, UNC `\\server`,
//      leading `/`, `~/`, `./`, `../`) - allows spaces in the body so paths
//      like `C:\Users\foo\OneDrive - Microsoft\Obsidian Vault\note.md` match
//      end-to-end. Lazy `+?` stops at the FIRST `.md\b`, so adjacent paths in
//      the same line stay separate. `:` is excluded from the body because no
//      legitimate path has a colon after the drive letter, which keeps the
//      match from running across URL fragments.
//   2. Bare filename with no prefix (e.g. `README.md`) - no spaces allowed,
//      otherwise we'd grab arbitrary surrounding prose.
//
// Single source of truth - imported by TerminalPanel's xterm link provider so
// the in-chat parser and the in-terminal provider can never drift apart.
// Pattern is a string (not a literal RegExp) so consumers always build a
// fresh stateful instance and `lastIndex` is never shared across callers.
export const MD_PATH_PATTERN = '(?:[A-Za-z]:[\\\\/]|~[\\\\/]|\\.{1,2}[\\\\/]|[\\\\/])[^"\'`<>|:*?\\r\\n]+?\\.md\\b|[^\\s"\'`<>|:*?\\r\\n]+\\.md\\b';

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
 * On Ctrl+Click, reads the file and opens the markdown preview.
 * @param cwd — optional working directory to resolve relative paths against
 */
export function renderWithMdLinks(text: string, cwd?: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MD_PATH_PATTERN, 'g');

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
          if (e.ctrlKey || e.metaKey) {
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
        title="Ctrl+Click to preview"
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
