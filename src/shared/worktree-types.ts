export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  isWorktree: boolean;
  detached?: boolean;
  bare?: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface RepoWorktrees {
  gitRoot: string;
  worktrees: WorktreeInfo[];
  isExpanded: boolean;
  error?: string;
}
