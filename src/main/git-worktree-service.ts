import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { WorktreeInfo, RepoWorktrees } from '../shared/worktree-types';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

/**
 * Parse `git worktree list --porcelain` output into structured data.
 *
 * Porcelain format example:
 *   worktree /path/to/main
 *   HEAD abc123
 *   branch refs/heads/main
 *
 *   worktree /path/to/feature
 *   HEAD def456
 *   branch refs/heads/feature
 *   locked
 */
function parseWorktreeOutput(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> | null = null;

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('worktree ')) {
      if (current?.path) worktrees.push(current as WorktreeInfo);
      current = { path: trimmed.slice('worktree '.length).replace(/\//g, path.sep) };
    } else if (trimmed.startsWith('HEAD ') && current) {
      current.head = trimmed.slice('HEAD '.length);
    } else if (trimmed.startsWith('branch ') && current) {
      // Strip refs/heads/ prefix for display
      const ref = trimmed.slice('branch '.length);
      current.branch = ref.replace(/^refs\/heads\//, '');
    } else if (trimmed === 'detached' && current) {
      current.detached = true;
    } else if (trimmed === 'bare' && current) {
      current.bare = true;
    } else if (trimmed.startsWith('locked') && current) {
      current.locked = true;
    } else if (trimmed.startsWith('prunable') && current) {
      current.prunable = true;
    }
  }

  if (current?.path) worktrees.push(current as WorktreeInfo);
  return worktrees;
}

/**
 * List worktrees for a given directory.
 * Resolves the git root first so results are consistent regardless of subdirectory.
 */
export async function listWorktrees(cwd: string): Promise<RepoWorktrees> {
  try {
    const root = (await git(cwd, 'rev-parse', '--show-toplevel')).trim().replace(/\//g, path.sep);
    const output = await git(root, 'worktree', 'list', '--porcelain');
    return {
      gitRoot: root,
      worktrees: parseWorktreeOutput(output),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Not a git repo — return empty
    if (msg.includes('not a git repository') || msg.includes('fatal:')) {
      return { gitRoot: cwd, worktrees: [], error: 'Not a git repository' };
    }
    return { gitRoot: cwd, worktrees: [], error: msg };
  }
}
