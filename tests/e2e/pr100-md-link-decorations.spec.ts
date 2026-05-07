// PR #100: make .md path links visibly clickable
//
// Asserts the core UX change: every .md link the provider emits carries
// `decorations: { underline: true, pointerCursor: true }` so xterm renders
// an underline and switches the cursor on hover. Pre-PR the decorations
// field was missing entirely, so paths matched silently with no visual cue
// that they were clickable.
//
// Also asserts the tooltip text was updated from "Ctrl+Click to preview:"
// to "Click to preview:" — matches the no-modifier activation behavior.
//
// Note on coverage scope: this spec deliberately does NOT cover the
// fileRead null/throw branches that were also tightened in this PR. The
// existing fileRead spy pattern (Object.defineProperty on terminalAPI)
// is currently broken across the whole e2e suite — task-107 fails with
// the same `Cannot redefine property: fileRead` error on current main,
// suggesting a contextBridge tightening in a recent Electron upgrade.
// Once the spy infra is restored, follow-up tests for the warn/error
// branches should slot in here.
//
// Helpers (writeToTerminal, parkCursorAt, getLinksOnRow, findRowsWithText)
// are modelled on tests/e2e/task-107-md-path-wrap-and-spaces.spec.ts so
// patterns stay consistent with the rest of the .md link provider's
// spec coverage.
import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function writeToTerminal(window: Page, text: string): Promise<void> {
  await window.evaluate(async (t: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const entry = (window as any).__getTerminalEntry(id);
    await new Promise<void>((resolve) => {
      entry.terminal.write(t, () => resolve());
    });
  }, text);
}

async function parkCursorAt(window: Page, row: number, col: number = 1): Promise<void> {
  await writeToTerminal(window, `\x1b[${row};${col}H`);
}

interface LinkInfo {
  text: string;
  tooltip?: string;
  decorations?: { underline?: boolean; pointerCursor?: boolean };
}

// Walk every link provider on the focused terminal and ask each for the
// links it would emit on row `r1`. Returns the raw shapes so the spec can
// assert on `decorations` / `tooltip` directly — the activate fn is
// omitted because Playwright cannot serialize functions out of page
// context.
async function getLinksOnRow(window: Page, row1Based: number): Promise<LinkInfo[]> {
  return window.evaluate(async (r: number) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const term = (window as any).__getTerminalEntry(id).terminal;
    const core = (term as any)._core;
    const service = core?._linkProviderService;
    const providers = service?.linkProviders || service?._linkProviders || [];
    const out: LinkInfo[] = [];
    for (const p of providers) {
      await new Promise<void>((resolve) => {
        try {
          p.provideLinks(r, (links: any) => {
            if (links) {
              for (const l of links) {
                out.push({
                  text: l.text,
                  tooltip: l.tooltip,
                  decorations: l.decorations
                    ? {
                        underline: l.decorations.underline,
                        pointerCursor: l.decorations.pointerCursor,
                      }
                    : undefined,
                });
              }
            }
            resolve();
          });
        } catch { resolve(); }
      });
    }
    return out;
  }, row1Based);
}

async function findRowsWithText(window: Page, needle: string): Promise<number[]> {
  return window.evaluate((s: string) => {
    const id = (window as any).__terminalStore.getState().focusedTerminalId;
    const term = (window as any).__getTerminalEntry(id).terminal;
    const buf = term.buffer.active;
    const out: number[] = [];
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.includes(s)) out.push(y + 1);
    }
    return out;
  }, needle);
}

test.describe('PR #100: .md link decorations + tooltip text', () => {
  test('every emitted .md link carries underline + pointerCursor decorations and the new tooltip', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);

      const path = 'C:\\projects\\notes\\readme.md';
      await parkCursorAt(window, 30, 1);
      await writeToTerminal(window, 'see: ' + path);
      await window.waitForTimeout(300);

      const rows = await findRowsWithText(window, 'readme.md');
      expect(rows.length).toBe(1);
      const y = rows[0];

      const links = await getLinksOnRow(window, y);
      const mdLinks = links.filter((l) => l.text.endsWith('readme.md'));
      expect(mdLinks.length).toBe(1);
      const md = mdLinks[0];

      // The PR's whole reason for being: decorations must be set on each
      // link the provider emits, otherwise xterm renders no underline and
      // does not change the cursor on hover.
      expect(md.decorations).toBeDefined();
      expect(md.decorations!.underline).toBe(true);
      expect(md.decorations!.pointerCursor).toBe(true);

      // Tooltip text was reworded as part of this PR — assert it so a
      // future "Ctrl+Click to preview" regression is caught.
      expect(md.tooltip).toBe(`Click to preview: ${path}`);
    } finally {
      await close();
    }
  });
});
