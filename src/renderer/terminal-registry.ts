/**
 * Global registry for xterm Terminal instances, addons, and lifecycle management.
 *
 * When React restructures the layout tree (e.g. closing a pane causes sibling
 * promotion), TerminalPanel components can unmount/remount. To avoid losing
 * terminal scrollback and PTY subscriptions, we "stash" the xterm instance
 * instead of disposing it. On remount the stashed instance is reattached to
 * the new container.
 */
import type { Terminal } from '@xterm/xterm';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { WebglAddon } from '@xterm/addon-webgl';

interface TerminalEntry {
  terminal: Terminal;
  searchAddon: SearchAddon;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  stashed: boolean;
  /** Cleanup callbacks created during TerminalPanel setup (PTY subs, etc.).
   *  Called only on actual terminal close, NOT on layout-induced unmounts. */
  cleanups: (() => void)[];
}

const registry = new Map<string, TerminalEntry>();

// Lazy-created off-screen container that holds stashed xterm DOM elements
let stashContainer: HTMLDivElement | null = null;
function getStashContainer(): HTMLDivElement {
  if (!stashContainer) {
    stashContainer = document.createElement('div');
    stashContainer.id = 'xterm-stash';
    stashContainer.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;';
    document.body.appendChild(stashContainer);
  }
  return stashContainer;
}

export function registerTerminal(
  id: string,
  terminal: Terminal,
  searchAddon: SearchAddon,
  fitAddon: FitAddon,
): void {
  registry.set(id, { terminal, searchAddon, fitAddon, webglAddon: null, stashed: false, cleanups: [] });
}

/** Store the WebGL addon reference for lifecycle management. */
export function setWebglAddon(id: string, addon: WebglAddon | null): void {
  const entry = registry.get(id);
  if (entry) entry.webglAddon = addon;
}

/** Store a cleanup callback that will run when the terminal is fully disposed. */
export function addTerminalCleanup(id: string, cleanup: () => void): void {
  const entry = registry.get(id);
  if (entry) entry.cleanups.push(cleanup);
}

export function unregisterTerminal(id: string): void {
  registry.delete(id);
}

export function getTerminalEntry(id: string): (TerminalEntry & { stashed: boolean }) | undefined {
  return registry.get(id);
}

export function getAllTerminals(): Terminal[] {
  return Array.from(registry.values()).map((e) => e.terminal);
}

/** Iterate all terminal entries with their IDs. */
export function getAllTerminalEntries(): Array<[string, TerminalEntry]> {
  return Array.from(registry.entries());
}

/** Move the xterm DOM element to the off-screen stash container.
 *  PTY subscriptions and xterm state are preserved. */
export function stashTerminal(id: string): void {
  const entry = registry.get(id);
  if (!entry || entry.stashed) return;
  const el = entry.terminal.element;
  if (el) {
    getStashContainer().appendChild(el);
  }
  entry.stashed = true;
}

/** Move a stashed xterm DOM element back into the given container.
 *  Returns true if reattachment succeeded. */
export function unstashTerminal(id: string, container: HTMLElement): boolean {
  const entry = registry.get(id);
  if (!entry || !entry.stashed) return false;
  const el = entry.terminal.element;
  if (el) {
    container.appendChild(el);
  }
  entry.stashed = false;
  return true;
}

/** Fully dispose a terminal: run stored cleanups, dispose xterm, remove from registry.
 *  Idempotent — safe to call even if already disposed. */
export function disposeTerminal(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  for (const cleanup of entry.cleanups) {
    try { cleanup(); } catch { /* ignore */ }
  }
  try { entry.webglAddon?.dispose(); } catch { /* ignore */ }
  try { entry.terminal.dispose(); } catch { /* already disposed */ }
  registry.delete(id);
}
