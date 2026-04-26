/**
 * Cache for xterm terminal buffer content across React unmount/remount cycles.
 *
 * When a TerminalPanel unmounts (e.g. float↔dock move, grid rebuild), the
 * xterm Terminal is disposed and all buffer content is lost. This cache stores
 * the serialized buffer so the new TerminalPanel instance can restore it.
 *
 * Safety measures:
 * - Entries auto-expire after EXPIRY_MS (the remount should happen within one
 *   React render cycle, so anything older is an orphan from a close/shutdown).
 * - Serialized content is capped at MAX_SERIALIZED_BYTES to avoid memory bloat
 *   from terminals with very large scrollback.
 */

const DEFAULT_EXPIRY_MS = 10_000;
const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024; // 2 MB

let expiryMs = DEFAULT_EXPIRY_MS;

/** Override the TTL for buffer cache entries (milliseconds). */
export function setBufferCacheExpiry(ms: number): void {
  expiryMs = ms;
}

interface BufferSnapshot {
  serialized: string;
  cols: number;
  rows: number;
  savedAt: number;
}

const cache = new Map<string, BufferSnapshot>();

export function saveTerminalBuffer(id: string, serialized: string, cols: number, rows: number): void {
  if (serialized.length > MAX_SERIALIZED_BYTES) {
    // Too large — skip rather than hog memory
    return;
  }
  cache.set(id, { serialized, cols, rows, savedAt: Date.now() });

  setTimeout(() => { cache.delete(id); }, expiryMs);
}

export function popTerminalBuffer(id: string): BufferSnapshot | undefined {
  const entry = cache.get(id);
  if (!entry) return undefined;
  cache.delete(id);
  // Discard stale entries (shouldn't happen with setTimeout, but belt & suspenders)
  if (Date.now() - entry.savedAt > expiryMs) return undefined;
  return entry;
}
