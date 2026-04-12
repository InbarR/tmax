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
function parseWorktreeOutput(output: string, gitRoot: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> | null = null;
  let isFirst = true;

  const pushEntry = () => {
    if (!current?.path) return;
    // First entry from `git worktree list` is always the main worktree
    const isMainWorktree = isFirst ||
      current.path!.toLowerCase() === gitRoot.toLowerCase();
    isFirst = false;
    current.isWorktree = !isMainWorktree;
    worktrees.push(current as WorktreeInfo);
    current = null;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('worktree ')) {
      pushEntry();
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
    } else if (trimmed === '' && current) {
      pushEntry();
    }
  }

  pushEntry();
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
      worktrees: parseWorktreeOutput(output, root),
      isExpanded: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not a git repository') || msg.includes('fatal:')) {
      return { gitRoot: cwd, worktrees: [], isExpanded: true, error: 'Not a git repository' };
    }
    return { gitRoot: cwd, worktrees: [], isExpanded: true, error: msg };
  }
}

/**
 * Create a new worktree with a new branch.
 * Places the worktree as a sibling directory with branch-name suffix.
 */
export async function createWorktree(
  repoPath: string,
  branchName: string,
  baseBranch: string,
): Promise<{ success: boolean; worktreePath?: string; error?: string }> {
  try {
    const repoName = path.basename(repoPath);
    const parentDir = path.dirname(repoPath);
    const safeBranchName = branchName.replace(/\//g, '-');
    const worktreePath = path.join(parentDir, `${repoName}-${safeBranchName}`);

    await git(repoPath, 'worktree', 'add', '-b', branchName, worktreePath, baseBranch);
    return { success: true, worktreePath };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Remove a linked worktree.
 */
export async function deleteWorktree(
  repoPath: string,
  worktreePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await git(repoPath, 'worktree', 'remove', worktreePath, '--force');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get list of local branches for a repository.
 */
export async function getBranches(repoPath: string): Promise<string[]> {
  try {
    const output = await git(repoPath, 'branch');
    return output
      .split('\n')
      .map((b) => b.trim().replace(/^\* /, ''))
      .filter((b) => b.length > 0);
  } catch {
    return ['main', 'master'];
  }
}
