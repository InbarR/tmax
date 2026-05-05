import { MCP_LIMITS } from './types';

/**
 * Per-pane PTY ring buffer (main process).
 *
 * The renderer's `terminal-buffer-cache.ts` only caches across React unmount
 * cycles; it has no copy of the live buffer. The MCP server needs to read
 * what a pane has been showing without round-tripping to the renderer, so
 * we keep a small ring of the most recent PTY bytes here, in main, and feed
 * it from `pty-manager.ts`.
 *
 * Caps:
 *  - `MCP_LIMITS.BUFFER_RING_BYTES` per pane to bound memory.
 *  - Front-trim aligns to a newline so `tail` always returns whole lines.
 */

interface Entry {
  /** Concatenated PTY data, most recent at the end. */
  data: string;
  /** Wallclock ms of the last PTY data write. */
  lastActivityTime: number;
  /** Final exit code once the PTY has exited; null while still alive. */
  lastExitCode: number | null;
}

class PaneBufferStore {
  private buffers = new Map<string, Entry>();

  ensure(paneId: string): Entry {
    let e = this.buffers.get(paneId);
    if (!e) {
      e = { data: '', lastActivityTime: 0, lastExitCode: null };
      this.buffers.set(paneId, e);
    }
    return e;
  }

  append(paneId: string, chunk: string): void {
    const e = this.ensure(paneId);
    e.data += chunk;
    e.lastActivityTime = Date.now();
    if (e.data.length > MCP_LIMITS.BUFFER_RING_BYTES) {
      // Trim the front of the buffer to the next newline so tail/search never
      // returns a half line.
      const overflow = e.data.length - MCP_LIMITS.BUFFER_RING_BYTES;
      const nl = e.data.indexOf('\n', overflow);
      e.data = nl >= 0 ? e.data.slice(nl + 1) : e.data.slice(overflow);
    }
  }

  setExit(paneId: string, exitCode: number | undefined): void {
    const e = this.ensure(paneId);
    e.lastExitCode = exitCode ?? null;
  }

  drop(paneId: string): void {
    this.buffers.delete(paneId);
  }

  getRaw(paneId: string): string {
    return this.buffers.get(paneId)?.data ?? '';
  }

  getMeta(paneId: string): { lastActivityTime: number; lastExitCode: number | null } {
    const e = this.buffers.get(paneId);
    return {
      lastActivityTime: e?.lastActivityTime ?? 0,
      lastExitCode: e?.lastExitCode ?? null,
    };
  }

  /**
   * Strip ANSI escape sequences and split into lines.
   *
   * The regex set covers the common cases (CSI, OSC, simple ESC sequences)
   * we see from interactive shells and CLIs. We don't try to be perfect —
   * the goal is human-readable text for an LLM, not byte-exact replay.
   */
  static toPlainLines(data: string): string[] {
    const stripped = data
      // CSI sequences (cursor, color, etc.)
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC sequences (titles, hyperlinks):  ESC ] ... BEL  or  ESC ] ... ST
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Other ESC sequences
      .replace(/\x1b[@-Z\\-_]/g, '')
      // Carriage returns without newline cause overwrites; collapse to nothing
      .replace(/\r(?!\n)/g, '');
    return stripped.split('\n');
  }

  has(paneId: string): boolean {
    return this.buffers.has(paneId);
  }
}

export const paneBufferStore = new PaneBufferStore();
export { PaneBufferStore };
