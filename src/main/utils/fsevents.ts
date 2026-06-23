// Shared probe for chokidar's macOS FSEvents backend.
//
// chokidar only uses the single, cheap FSEvents watcher for a directory tree
// when the native `fsevents` module is loadable. When it isn't (e.g. it wasn't
// bundled into a packaged build) AND we pass `usePolling: false`, chokidar
// silently falls back to opening one `fs.watch` file descriptor per directory.
// On accounts with thousands of ~/.copilot / ~/.claude session dirs that
// instantly exhausts the process file-descriptor limit:
//
//   Error: EMFILE: too many open files, watch
//
// The flood saturates the main event loop, so the renderer's startup IPC stalls
// and the app hangs forever on "Restoring session...". (Finder/Dock-launched
// apps make it worse: they inherit a 256 fd soft limit, vs the high ulimit a
// terminal-launched `npm start` gets.)
//
// `canUseNativeRecursiveWatch()` lets callers decide whether forcing
// `usePolling: false` is safe. The packaged app now bundles `fsevents`, so on
// macOS this returns true; this probe is the safety net that keeps a missing
// fsevents from turning into a hang — we degrade to bounded stat-polling
// (no persistent fds) instead.

let cached: boolean | null = null;

/** Whether the native `fsevents` module can be required in this process. */
export function isFseventsLoadable(): boolean {
  if (cached !== null) return cached;
  try {
    // Resolved at runtime from node_modules (marked external to the bundler).
    require('fsevents');
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Whether chokidar can recursively watch a large directory tree with
 * `usePolling: false` without exhausting file descriptors.
 *
 * - Windows: `fs.watch` supports a single native recursive watch → safe.
 * - Linux: chokidar uses inotify (one cheap watch per dir, high default limit)
 *   — this was the pre-existing behavior, kept unchanged.
 * - macOS: safe ONLY when `fsevents` loads (single FSEvents watcher). Without
 *   it, per-directory `fs.watch` exhausts fds, so callers should fall back to
 *   polling instead.
 */
export function canUseNativeRecursiveWatch(): boolean {
  if (process.platform !== 'darwin') return true;
  return isFseventsLoadable();
}
