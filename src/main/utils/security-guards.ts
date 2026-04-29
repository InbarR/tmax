/**
 * Pure validation functions extracted from main.ts and git-diff-service.ts
 * so they can be regression-tested without launching Electron.
 */
import * as path from 'path';

// ── OPEN_PATH extension blocklist (PR #58) ──────────────────────────
export const DANGEROUS_OPEN_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.msi', '.com', '.scr', '.pif',
  '.lnk', '.hta', '.vbs', '.vbe', '.jse', '.wsf', '.wsh',
  '.reg', '.msc', '.cpl', '.chm',
  '.sh', '.app', '.command',
  '.jar', '.py', '.pyw',
]);

/** Returns true if the file extension is in the dangerous blocklist. */
export function isDangerousExtension(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return DANGEROUS_OPEN_EXTENSIONS.has(ext);
}

// ── WSL distro validation (PR #60) ──────────────────────────────────
const WSL_DISTRO_REGEX = /^[\w][\w.\-]*$/;

/** Returns true if the WSL distro name is valid. */
export function isValidWslDistro(distro: string): boolean {
  return WSL_DISTRO_REGEX.test(distro);
}

// ── Path traversal guard (PR #57) ───────────────────────────────────
/**
 * Checks whether resolvedPath is within rootResolved.
 * Rejects sibling-prefix paths (e.g. `/home/user-evil` when root is `/home/user`).
 */
export function isPathWithinRoot(rootResolved: string, resolvedPath: string): boolean {
  if (resolvedPath === rootResolved) return true;
  return resolvedPath.startsWith(rootResolved + path.sep);
}

/**
 * Resolves filePath relative to root and throws if it escapes the root.
 */
export function assertNoPathTraversal(root: string, filePath: string): string {
  const rootResolved = path.resolve(root);
  const resolvedPath = path.resolve(rootResolved, filePath);
  if (!isPathWithinRoot(rootResolved, resolvedPath)) {
    throw new Error('Path traversal detected');
  }
  return resolvedPath;
}
