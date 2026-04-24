import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Verifies that oh-my-posh renders correctly in tmax: no "CONFIG NOT FOUND",
// the user's username appears in the prompt, and truecolor ANSI escapes
// (signalling that oh-my-posh ran) reach the xterm buffer.
//
// Requires: oh-my-posh installed on the machine, a valid $PROFILE that
// initializes it, and a Nerd Font installed system-wide.

test.describe('oh-my-posh renders in tmax', () => {
  test.skip(process.platform !== 'win32', 'Windows-only (oh-my-posh path assumes pwsh profile)');

  test('prompt renders without CONFIG NOT FOUND and contains expected segments', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      // Oh-my-posh + profile load takes a moment; give ConPTY time to emit the prompt
      await window.waitForTimeout(5_000);

      const result = await window.evaluate(() => {
        const id = (window as any).__terminalStore.getState().focusedTerminalId;
        const entry = (window as any).__getTerminalEntry(id);
        if (!entry) return { visible: '', fontFamily: '', hasPuaGlyphs: false };
        const term = entry.terminal;
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let y = 0; y < buf.length; y++) {
          const line = buf.getLine(y);
          if (line) lines.push(line.translateToString(true));
        }
        const full = lines.join('\n');
        // Nerd Font glyphs live in the Unicode Private Use Area (U+E000 - U+F8FF).
        // oh-my-posh themes emit these for powerline triangles and segment icons.
        const hasPuaGlyphs = /[-]/.test(full);
        // Pull font-family straight from xterm's configured options.
        const fontFamily = (term.options && term.options.fontFamily) || '';
        return { visible: full, fontFamily, hasPuaGlyphs };
      });

      console.log('[prompt buffer] ---');
      console.log(result.visible);
      console.log('[/prompt buffer] fontFamily:', result.fontFamily, 'hasPuaGlyphs:', result.hasPuaGlyphs);

      // oh-my-posh loaded without errors
      expect(result.visible).not.toContain('CONFIG NOT FOUND');
      expect(result.visible).not.toMatch(/unable to (open|load|find).*config/i);

      // Username should appear in the prompt (identity segment of jandedobbeleer theme)
      expect(result.visible.toLowerCase()).toContain('inrotem');

      // xterm is configured with a Nerd Font in its fallback chain
      expect(result.fontFamily.toLowerCase()).toMatch(/caskaydiacove|nerd/);

      // oh-my-posh emits Nerd Font glyphs (powerline triangles, segment icons) in PUA
      expect(result.hasPuaGlyphs).toBe(true);
    } finally {
      await close();
    }
  });
});
