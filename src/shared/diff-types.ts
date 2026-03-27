// ── Diff Editor Types ─────────────────────────────────────────────────

export type DiffMode = 'unstaged' | 'staged' | 'branch';

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface DiffFile {
  path: string;
  oldPath?: string; // for renames
  status: DiffFileStatus;
  additions: number;
  deletions: number;
}

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
}

export interface DiffResult {
  files: DiffFile[];
  diffs: FileDiff[];
  summary: { filesChanged: number; additions: number; deletions: number };
  commitHash: string;
  branch: string;
}

export interface AnnotatedLine {
  lineNumber: number;
  content: string;
  type: DiffLineType;
}

export interface AnnotatedFile {
  path: string;
  lines: AnnotatedLine[];
}

export interface DiffComment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
  lineType: DiffLineType;
  selectedText: string;
  comment: string;
}
