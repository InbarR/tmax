// Use platform info from Electron preload if available, fall back to navigator
const platform = (window as any).platformInfo?.platform as string | undefined;
export const isMac = platform === 'darwin' || /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Check if the platform primary modifier is pressed (Cmd on Mac, Ctrl elsewhere) */
export function hasPrimaryMod(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/** Convert a keybinding string to platform-native display (e.g. Ctrl → ⌘ on Mac) */
export function formatKeyForPlatform(combo: string): string {
  if (!isMac) return combo;
  return combo
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥');
}
