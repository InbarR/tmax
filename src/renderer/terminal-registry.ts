/**
 * Global registry for xterm Terminal instances and their SearchAddons.
 * Used by components (e.g. PromptsDialog) that need to search/scroll
 * a terminal without holding a direct ref.
 */
import type { Terminal } from '@xterm/xterm';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalEntry {
  terminal: Terminal;
  searchAddon: SearchAddon;
}

const registry = new Map<string, TerminalEntry>();

export function registerTerminal(id: string, terminal: Terminal, searchAddon: SearchAddon): void {
  registry.set(id, { terminal, searchAddon });
}

export function unregisterTerminal(id: string): void {
  registry.delete(id);
}

export function getTerminalEntry(id: string): TerminalEntry | undefined {
  return registry.get(id);
}

export function getAllTerminals(): Terminal[] {
  return Array.from(registry.values()).map((e) => e.terminal);
}
