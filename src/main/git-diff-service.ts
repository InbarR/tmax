import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffLineType,
  FileDiff,
  DiffResult,
  DiffMode,
  AnnotatedLine,
  AnnotatedFile,
  DiffFileStatus,
} from '../shared/diff-types';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

// ── CWD / Git root resolution ───────────────────────────────────────

/**
 * Try to find the git root by running `git rev-parse --show-toplevel` in `cwd`.
 * Returns null if cwd is not inside a git repo.
 */
async function tryGitRoot(cwd: string): Promise<string | null> {
  try {
    const root = (await git(cwd, 'rev-parse', '--show-toplevel')).trim();
    return root.replace(/\//g, path.sep);
  } catch {
    return null;
  }
}

/**
 * Resolve the git root from a renderer-tracked CWD.
 * The renderer already tracks the terminal's current directory via prompt parsing,
 * so we just need to find the git root from that path.
 */
export async function resolveGitRoot(cwd: string): Promise<string> {
  if (!cwd) throw new Error('No CWD provided — terminal may not have reported its directory yet.');

  // 1. Try git rev-parse directly
  const root = await tryGitRoot(cwd);
  if (root) return root;

  // 2. Walk up looking for .git directory
  let dir = cwd;
  while (dir) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(`No git repository found from: ${cwd}`);
}

// ── Git operations ─────────────────────────────────────────────────

export class GitDiffService {
  async getGitRoot(cwd: string): Promise<string> {
    const root = await git(cwd, 'rev-parse', '--show-toplevel');
    return root.trim().replace(/\//g, path.sep);
  }

  async getCodeChanges(cwd: string, mode: DiffMode): Promise<DiffFile[]> {
    const root = await this.getGitRoot(cwd);
    const files: DiffFile[] = [];

    if (mode === 'branch') {
      // Diff against main merge-base
      const mergeBase = (await git(root, 'merge-base', 'HEAD', 'main')).trim();
      const numstat = await git(root, 'diff', '--numstat', mergeBase + '..HEAD');
      const nameStatus = await git(root, 'diff', '--name-status', mergeBase + '..HEAD');
      return this.parseFileList(numstat, nameStatus);
    }

    // For staged/unstaged, combine git status + numstat
    const staged = mode === 'staged';
    const statusOutput = await git(root, 'status', '--porcelain', '-u');
    const diffArgs = staged ? ['diff', '--cached', '--numstat'] : ['diff', '--numstat'];
    const numstat = await git(root, ...diffArgs);
    const nameStatusArgs = staged ? ['diff', '--cached', '--name-status'] : ['diff', '--name-status'];
    const nameStatus = await git(root, ...nameStatusArgs);

    const parsedFiles = this.parseFileList(numstat, nameStatus);

    // Also include untracked files for unstaged mode
    if (!staged) {
      const statusLines = statusOutput.split('\n').filter(Boolean);
      for (const line of statusLines) {
        const code = line.substring(0, 2);
        const filePath = line.substring(3).trim();
        if (code === '??') {
          // Untracked file — only include if not already in diff
          if (!parsedFiles.some(f => f.path === filePath)) {
            parsedFiles.push({
              path: filePath,
              status: 'added',
              additions: 0,
              deletions: 0,
            });
          }
        }
      }
    }

    return parsedFiles;
  }

  private parseFileList(numstat: string, nameStatus: string): DiffFile[] {
    const files: DiffFile[] = [];
    const statusMap = new Map<string, DiffFileStatus>();

    for (const line of nameStatus.split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      const code = parts[0].charAt(0);
      const filePath = parts.length > 2 ? parts[2] : parts[1]; // renamed: old\tnew
      let status: DiffFileStatus = 'modified';
      if (code === 'A') status = 'added';
      else if (code === 'D') status = 'deleted';
      else if (code === 'R') status = 'renamed';
      statusMap.set(filePath, status);
      if (code === 'R' && parts.length > 2) {
        statusMap.set(parts[2], 'renamed');
      }
    }

    for (const line of numstat.split('\n').filter(Boolean)) {
      const [add, del, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t'); // handle paths with tabs (rename notation)
      const actualPath = filePath.includes('=>')
        ? filePath.replace(/.*=> /, '').replace(/[{}]/g, '').trim()
        : filePath;
      files.push({
        path: actualPath,
        oldPath: filePath.includes('=>')
          ? filePath.replace(/ =>.*/, '').replace(/[{}]/g, '').trim()
          : undefined,
        status: statusMap.get(actualPath) || 'modified',
        additions: add === '-' ? 0 : parseInt(add, 10),
        deletions: del === '-' ? 0 : parseInt(del, 10),
      });
    }

    return files;
  }

  async getDiff(cwd: string, mode: DiffMode): Promise<DiffResult> {
    const root = await this.getGitRoot(cwd);

    let diffArgs: string[];
    if (mode === 'branch') {
      const mergeBase = (await git(root, 'merge-base', 'HEAD', 'main')).trim();
      diffArgs = ['diff', '-U3', mergeBase + '..HEAD'];
    } else if (mode === 'staged') {
      diffArgs = ['diff', '--cached', '-U3'];
    } else {
      diffArgs = ['diff', '-U3'];
    }

    const raw = await git(root, ...diffArgs);
    const diffs = this.parseDiff(raw);
    const files = await this.getCodeChanges(cwd, mode);

    let commitHash = '';
    let branch = '';
    try {
      commitHash = (await git(root, 'rev-parse', '--short', 'HEAD')).trim();
      branch = (await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
    } catch { /* detached HEAD */ }

    const summary = {
      filesChanged: files.length,
      additions: files.reduce((s, f) => s + f.additions, 0),
      deletions: files.reduce((s, f) => s + f.deletions, 0),
    };

    return { files, diffs, summary, commitHash, branch };
  }

  parseDiff(raw: string): FileDiff[] {
    const fileDiffs: FileDiff[] = [];
    const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

    for (const chunk of fileChunks) {
      const lines = chunk.split('\n');
      let filePath = '';
      let oldPath: string | undefined;

      // Parse file path from diff header
      const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
      if (headerMatch) {
        oldPath = headerMatch[1];
        filePath = headerMatch[2];
        if (oldPath === filePath) oldPath = undefined;
      }

      const hunks: DiffHunk[] = [];
      let currentHunk: DiffHunk | null = null;

      for (const line of lines) {
        const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
        if (hunkMatch) {
          currentHunk = {
            header: line,
            oldStart: parseInt(hunkMatch[1], 10),
            oldCount: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newCount: parseInt(hunkMatch[4] || '1', 10),
            lines: [],
          };
          hunks.push(currentHunk);
          continue;
        }

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
          currentHunk.lines.push({
            type: 'added',
            content: line.substring(1),
            oldLineNumber: null,
            newLineNumber: null, // filled below
          });
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({
            type: 'removed',
            content: line.substring(1),
            oldLineNumber: null,
            newLineNumber: null,
          });
        } else if (line.startsWith(' ') || line === '') {
          currentHunk.lines.push({
            type: 'unchanged',
            content: line.startsWith(' ') ? line.substring(1) : line,
            oldLineNumber: null,
            newLineNumber: null,
          });
        }
      }

      // Assign line numbers
      for (const hunk of hunks) {
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        for (const line of hunk.lines) {
          if (line.type === 'added') {
            line.newLineNumber = newLine++;
          } else if (line.type === 'removed') {
            line.oldLineNumber = oldLine++;
          } else {
            line.oldLineNumber = oldLine++;
            line.newLineNumber = newLine++;
          }
        }
      }

      if (filePath) {
        fileDiffs.push({ path: filePath, oldPath, hunks });
      }
    }

    return fileDiffs;
  }

  async readFileContent(cwd: string, filePath: string): Promise<string> {
    const root = await this.getGitRoot(cwd);
    const rootResolved = path.resolve(root);
    const resolvedPath = path.resolve(rootResolved, filePath);
    if (resolvedPath !== rootResolved && !resolvedPath.startsWith(rootResolved + path.sep)) {
      throw new Error('Path traversal detected');
    }
    return readFile(resolvedPath, 'utf-8');
  }

  async getAnnotatedFile(cwd: string, filePath: string, mode: DiffMode): Promise<AnnotatedFile> {
    const root = await this.getGitRoot(cwd);

    // Get the diff for this specific file
    let diffArgs: string[];
    if (mode === 'branch') {
      const mergeBase = (await git(root, 'merge-base', 'HEAD', 'main')).trim();
      diffArgs = ['diff', '-U999999', mergeBase + '..HEAD', '--', filePath];
    } else if (mode === 'staged') {
      diffArgs = ['diff', '--cached', '-U999999', '--', filePath];
    } else {
      diffArgs = ['diff', '-U999999', '--', filePath];
    }

    const raw = await git(root, ...diffArgs);

    if (!raw.trim()) {
      // No diff — file is unmodified or untracked; read as-is
      try {
        const rootResolved = path.resolve(root);
        const resolvedPath = path.resolve(rootResolved, filePath);
        // Require the resolved path to be the root itself or a descendant. Plain
        // startsWith would admit sibling directories like `/home/user-evil` when
        // root is `/home/user`; appending path.sep closes that hole.
        if (resolvedPath !== rootResolved && !resolvedPath.startsWith(rootResolved + path.sep)) {
          throw new Error('Path traversal detected');
        }
        const content = await readFile(resolvedPath, 'utf-8');
        const lines: AnnotatedLine[] = content.split('\n').map((line, i) => ({
          lineNumber: i + 1,
          content: line,
          type: 'unchanged' as DiffLineType,
        }));
        return { path: filePath, lines };
      } catch (e) {
        if (e instanceof Error && e.message === 'Path traversal detected') throw e;
        return { path: filePath, lines: [] };
      }
    }

    // Parse the full-context diff to get annotated lines
    const diffs = this.parseDiff(raw);
    const fileDiff = diffs[0];
    if (!fileDiff || fileDiff.hunks.length === 0) {
      const rootResolved = path.resolve(root);
      const resolvedPath = path.resolve(rootResolved, filePath);
      if (resolvedPath !== rootResolved && !resolvedPath.startsWith(rootResolved + path.sep)) {
        throw new Error('Path traversal detected');
      }
      const content = await readFile(resolvedPath, 'utf-8');
      const lines: AnnotatedLine[] = content.split('\n').map((line, i) => ({
        lineNumber: i + 1,
        content: line,
        type: 'unchanged' as DiffLineType,
      }));
      return { path: filePath, lines };
    }

    // Build annotated lines from the unified diff with full context
    const annotatedLines: AnnotatedLine[] = [];
    let lineNum = 1;

    for (const hunk of fileDiff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'removed') {
          // Removed lines don't appear in the new file, but we show them
          annotatedLines.push({
            lineNumber: -1, // marker for removed
            content: line.content,
            type: 'removed',
          });
        } else {
          annotatedLines.push({
            lineNumber: lineNum++,
            content: line.content,
            type: line.type,
          });
        }
      }
    }

    return { path: filePath, lines: annotatedLines };
  }
}
