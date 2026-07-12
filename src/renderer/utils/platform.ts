// Use platform info from Electron preload if available, fall back to navigator
const platform = (window as any).platformInfo?.platform as string | undefined;
export const isMac = platform === 'darwin' || /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const isDev = !!(window as any).platformInfo?.isDev;

/** Check if the platform primary modifier is pressed (Cmd on Mac, Ctrl elsewhere) */
export function hasPrimaryMod(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/**
 * Match a letter shortcut independent of the active keyboard layout. With a
 * non-Latin layout (e.g. Hebrew) active, `event.key` is the localized character
 * (Hebrew bet for the physical C key), so `event.key === 'c'` silently misses
 * and shortcuts like Ctrl+C/V/F stop working. `event.code` reports the physical
 * key position ('KeyC') regardless of layout, so we match on it too while
 * keeping `event.key` as a fallback for environments that don't populate `code`.
 */
export function isLetterShortcut(event: { key: string; code: string }, letter: string): boolean {
  const lower = letter.toLowerCase();
  return (
    event.key === lower ||
    event.key === lower.toUpperCase() ||
    event.code === `Key${lower.toUpperCase()}`
  );
}

/** Convert a keybinding string to platform-native display (e.g. Ctrl → ⌘ on Mac) */
export function formatKeyForPlatform(combo: string): string {
  if (!isMac) return combo;
  return combo
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥');
}
