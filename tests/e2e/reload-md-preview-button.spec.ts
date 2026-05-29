// Reload button in the markdown preview header (this PR).
//
// What changed: MarkdownPreview now accepts an `onReload?: () => void` prop
// and renders a "Reload from disk" button when supplied.
// MarkdownPreviewOverlay wires it to `window.terminalAPI.fileRead(filePath)`
// and pushes the fresh string into `markdownPreview.content` for md files.
// Image previews intentionally do NOT get the button — they fetch bytes via
// a separate IPC inside MarkdownPreview and `content` is unused there.
//
// This spec drives the overlay through the real store: write a markdown
// file to disk, seed the store, click the reload button, mutate the file,
// click again, and assert the rendered content reflects each disk state.
// That exercises the full surface (button render + IPC + store update +
// re-render) without depending on the link provider or fileRead spies
// (the spy infra is currently broken per the PR #100 spec note).
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchTmax } from './fixtures/launch';

test.describe('Markdown preview: reload button', () => {
  test('reload button refreshes md preview content from disk', async () => {
    const { window, close } = await launchTmax();
    const tmpDir = mkdtempSync(join(tmpdir(), 'tmax-reload-'));
    const filePath = join(tmpDir, 'note.md');
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });

      // Initial disk content -> open preview by seeding the store directly.
      writeFileSync(filePath, '# First version\n\nhello', 'utf8');
      await window.evaluate((args: { filePath: string; fileName: string; content: string }) => {
        (window as any).__terminalStore.setState({
          markdownPreview: {
            filePath: args.filePath,
            fileName: args.fileName,
            content: args.content,
            kind: 'md',
          },
        });
      }, { filePath, fileName: 'note.md', content: '# First version\n\nhello' });

      await window.waitForSelector('[data-testid="md-preview-reload-btn"]', { timeout: 5_000 });
      await expect(window.locator('.md-rendered-content h1')).toHaveText('First version');

      // Mutate the file on disk, then click reload — content should update
      // without re-triggering the link provider or reopening the overlay.
      writeFileSync(filePath, '# Second version\n\nworld', 'utf8');
      await window.locator('[data-testid="md-preview-reload-btn"]').click();
      await expect(window.locator('.md-rendered-content h1')).toHaveText('Second version', { timeout: 5_000 });

      // Second mutation + click — confirms the button is reusable, not a
      // one-shot. Guards against a regression where the handler captured
      // stale state.
      writeFileSync(filePath, '# Third version\n\n!', 'utf8');
      await window.locator('[data-testid="md-preview-reload-btn"]').click();
      await expect(window.locator('.md-rendered-content h1')).toHaveText('Third version', { timeout: 5_000 });

      // Store content should match the latest disk content exactly.
      const storedContent = await window.evaluate(() =>
        (window as any).__terminalStore.getState().markdownPreview?.content,
      );
      expect(storedContent).toBe('# Third version\n\n!');
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      await close();
    }
  });

  test('reload button is not rendered for image previews', async () => {
    const { window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });

      // Image kind previews fetch bytes inside MarkdownPreview via a
      // separate IPC and don't flow through the `content` field, so
      // exposing the reload button there would be a no-op at best. Keep
      // it hidden until image reload is wired explicitly.
      await window.evaluate(() => {
        (window as any).__terminalStore.setState({
          markdownPreview: {
            filePath: 'C:/does/not/matter/screenshot.png',
            fileName: 'screenshot.png',
            content: '',
            kind: 'image',
          },
        });
      });

      // Wait for the overlay to mount before asserting the button is absent.
      await window.waitForSelector('.file-preview-overlay', { timeout: 5_000 });
      await expect(window.locator('[data-testid="md-preview-reload-btn"]')).toHaveCount(0);
    } finally {
      await close();
    }
  });
});
