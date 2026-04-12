export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  detached?: boolean;
  bare?: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface RepoWorktrees {
  gitRoot: string;
  worktrees: WorktreeInfo[];
  error?: string;
}
