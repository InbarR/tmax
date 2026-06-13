// Standalone derivation of the app's "chrome" CSS variables from an xterm
// theme object. Extracted so the minimal detached-window renderer
// (DetachedApp) can match the active theme WITHOUT importing the full
// zustand terminal-store (which instantiates the whole store as an import
// side effect). terminal-store keeps its own richer applyThemeToChromeVars
// for the main window (it also syncs live xterm transparency); this is the
// lightweight, registry-free subset used to paint detached-window chrome.

function luminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustBrightness(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(m[1], 16) + amount);
  const g = clamp(parseInt(m[2], 16) + amount);
  const b = clamp(parseInt(m[3], 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/**
 * Set the subset of chrome CSS variables needed to render UI chrome (title
 * bars, borders, secondary text) on `document.documentElement`, derived from
 * an xterm theme. Mirrors terminal-store.applyThemeToChromeVars for the
 * background/border/text vars, minus the live-terminal transparency sync.
 */
export function applyChromeVarsFromTheme(
  theme: Record<string, string> | undefined,
  transparencyOpacity?: number,
): void {
  if (!theme) return;
  const bg = theme.background || '#1e1e2e';
  const fg = theme.foreground || '#cdd6f4';
  const isLight = luminance(bg) > 0.5;
  const step = isLight ? -15 : 15;
  const useTransparency = transparencyOpacity !== undefined && transparencyOpacity < 1;

  const root = document.documentElement;

  if (useTransparency) {
    root.style.setProperty('--bg-primary', hexToRgba(bg, transparencyOpacity));
    root.style.setProperty('--bg-secondary', hexToRgba(adjustBrightness(bg, step), transparencyOpacity));
  } else {
    root.style.setProperty('--bg-primary', bg);
    root.style.setProperty('--bg-secondary', adjustBrightness(bg, step));
  }

  root.style.setProperty('--border-color', adjustBrightness(bg, step * 2));
  root.style.setProperty('--text-primary', fg);
  root.style.setProperty('--text-secondary', adjustBrightness(fg, isLight ? 60 : -60));
  root.style.setProperty('--focus-border', theme.blue || '#89b4fa');
}
