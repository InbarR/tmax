/**
 * Bundled theme presets - used by Settings → Theme to swap the entire xterm
 * palette in one click, and applied on startup so the chrome (tabs, sidebar,
 * status bar) matches.
 *
 * Each preset has:
 *   - `theme`: the 12-color xterm palette + bright variants. Persisted to
 *     config.theme (existing schema) so xterm picks it up the same way as
 *     manual color edits.
 *   - `chrome`: overrides for the global :root CSS variables (background,
 *     borders, accent, etc). Applied via documentElement.style at runtime;
 *     not persisted - inferred from the active xterm theme each session.
 *
 * Adding a preset: append an object below. The detection logic in
 * applyChromeFromTheme matches presets by xterm color equality, so the
 * preset's `theme` must be unique enough to identify it.
 */
export interface ThemePreset {
  name: string;
  theme: Record<string, string>;
  chrome: Record<string, string>;
}

const CATPPUCCIN_CHROME: Record<string, string> = {
  '--bg-primary': '#1e1e2e',
  '--bg-secondary': '#313244',
  '--border-color': '#45475a',
  '--focus-border': '#89b4fa',
  '--text-primary': '#cdd6f4',
  '--text-secondary': '#a6adc8',
  '--tab-bg': '#313244',
  '--tab-active': '#45475a',
};

const WARM_DUSK_CHROME: Record<string, string> = {
  '--bg-primary': '#11192a',
  '--bg-secondary': '#1c2438',
  '--border-color': '#2e3a52',
  '--focus-border': '#ee6c4d',
  '--text-primary': '#c8d3e6',
  '--text-secondary': '#8a96b0',
  '--tab-bg': '#1c2438',
  '--tab-active': '#3a2e3e',
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Catppuccin Mocha',
    theme: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#585b70',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
    chrome: CATPPUCCIN_CHROME,
  },
  {
    name: 'Warm Dusk',
    theme: {
      background: '#11192a',
      foreground: '#c8d3e6',
      cursor: '#ee6c4d',
      selectionBackground: '#2e3a52',
      black: '#2a3142',
      red: '#ee6c4d',
      green: '#7ec1bb',
      yellow: '#f4a261',
      blue: '#6c8ebf',
      magenta: '#d09cfa',
      cyan: '#56b6c2',
      white: '#c8d3e6',
      brightBlack: '#3d4660',
      brightRed: '#ff8a6b',
      brightGreen: '#9bd6cf',
      brightYellow: '#ffb37a',
      brightBlue: '#8eaad6',
      brightMagenta: '#e0b3ff',
      brightCyan: '#7fc9d4',
      brightWhite: '#e0e8f5',
    },
    chrome: WARM_DUSK_CHROME,
  },
];

export function themesEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string>,
): boolean {
  if (!a) return false;
  for (const k of Object.keys(b)) {
    if ((a[k] || '').toLowerCase() !== (b[k] || '').toLowerCase()) return false;
  }
  return true;
}

/**
 * Match the current xterm theme to a preset by exact color equality and apply
 * its chrome to the document root. If no preset matches (user hand-edited
 * colors or migrated from an old config), fall back to Catppuccin Mocha.
 */
export function applyChromeFromTheme(theme: Record<string, string> | undefined): void {
  if (typeof document === 'undefined') return;
  const matched =
    THEME_PRESETS.find((p) => themesEqual(theme, p.theme)) ?? THEME_PRESETS[0];
  for (const [key, value] of Object.entries(matched.chrome)) {
    document.documentElement.style.setProperty(key, value);
  }
}
