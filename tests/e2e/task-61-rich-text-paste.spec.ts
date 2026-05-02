// TASK-61: rich-text paste must prefer visible text over a link URL or
// saved-PNG path when the clipboard has more than just a bare link/image.
//
// Pre-fix the paste handler over-fired:
//   - clipboardHasImage() === true → save PNG, paste path. Always wins,
//     even when there's text on the clipboard alongside the image (Teams
//     emoji-in-prose).
//   - extractLinkFromHtml() returned the URL whenever HTML had exactly one
//     <a href>, even when the HTML had real prose around the link (Teams
//     chat with a hyperlink, web articles).
//
// Post-fix:
//   - Image only wins when no plain text is on the clipboard.
//   - HTML-as-URL only wins when the HTML's visible text equals the link's
//     inner text (i.e. the HTML is just an <a> wrapper - ADO/Outlook
//     "Copy link" cases). Rich text with prose around the link falls
//     through to plain text.
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function installPtyWriteSpy(window: Page): Promise<void> {
  await window.evaluate(() => {
    (window as any).__ptyWrites = [];
    const orig = (window as any).terminalAPI.writePty.bind((window as any).terminalAPI);
    (window as any).terminalAPI.writePty = (id: string, data: string) => {
      (window as any).__ptyWrites.push({ id, data });
      return orig(id, data);
    };
  });
}

async function getPastedText(window: Page): Promise<string> {
  const writes = await window.evaluate(() => (window as any).__ptyWrites.slice() as Array<{ id: string; data: string }>);
  return writes.map(w => w.data).join('');
}

async function clearPtyWrites(window: Page): Promise<void> {
  await window.evaluate(() => { (window as any).__ptyWrites = []; });
}

async function seedHtmlAndText(app: ElectronApplication, html: string, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, args) => {
    clipboard.write({ html: args.html, text: args.text });
  }, { html, text });
}

async function seedImageWithText(app: ElectronApplication, dataUrl: string, text: string): Promise<void> {
  await app.evaluate(({ clipboard, nativeImage }, args) => {
    clipboard.write({ image: nativeImage.createFromDataURL(args.dataUrl), text: args.text });
  }, { dataUrl, text });
}

async function seedImageOnly(app: ElectronApplication, dataUrl: string): Promise<void> {
  await app.evaluate(({ clipboard, nativeImage }, args) => {
    clipboard.clear();
    clipboard.writeImage(nativeImage.createFromDataURL(args.dataUrl));
  }, { dataUrl });
}

async function seedPlainText(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, args) => {
    clipboard.clear();
    clipboard.writeText(args.text);
  }, { text });
}

async function focusAndPaste(window: Page): Promise<void> {
  await window.click('.terminal-panel .xterm-screen');
  await window.waitForTimeout(150);
  await window.keyboard.press('Control+v');
  await window.waitForTimeout(300);
}

// 1x1 transparent PNG — the smallest valid image we can put on the clipboard.
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

test.describe('TASK-61: rich-text paste prefers visible text', () => {
  test('rich text with link AND surrounding prose pastes the prose, not the URL', async () => {
    const { app, window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installPtyWriteSpy(window);

      const html = '<p>Hey check <a href="https://example.com/article">this page</a> please</p>';
      const plainText = 'Hey check this page please';
      await seedHtmlAndText(app, html, plainText);
      await clearPtyWrites(window);
      await focusAndPaste(window);

      const pasted = await getPastedText(window);
      // Bug: pre-fix the URL replaces the prose entirely.
      expect(pasted, `pasted="${pasted}"`).not.toContain('https://example.com/article');
      expect(pasted, `pasted="${pasted}"`).toContain('Hey check this page please');
    } finally {
      await close();
    }
  });

  test('HTML that is JUST a link wrapper (ADO PR / Outlook safelink) pastes the URL', async () => {
    const { app, window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installPtyWriteSpy(window);

      // ADO "Copy to clipboard" shape: HTML is just the <a> wrapping a title,
      // plain text is the same title. We want the URL.
      const html = '<a href="https://dev.azure.com/org/_git/repo/pullrequest/123">PR #123 - Some title</a>';
      const plainText = 'PR #123 - Some title';
      await seedHtmlAndText(app, html, plainText);
      await clearPtyWrites(window);
      await focusAndPaste(window);

      const pasted = await getPastedText(window);
      expect(pasted, `pasted="${pasted}"`).toContain('https://dev.azure.com/org/_git/repo/pullrequest/123');
    } finally {
      await close();
    }
  });

  test('clipboard with image AND text pastes the text', async () => {
    const { app, window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installPtyWriteSpy(window);

      await seedImageWithText(app, TINY_PNG_DATA_URL, 'hello world from teams');
      await clearPtyWrites(window);
      await focusAndPaste(window);

      const pasted = await getPastedText(window);
      // Bug: pre-fix the image wins and we paste a saved-PNG file path.
      expect(pasted, `pasted="${pasted}"`).not.toMatch(/\.png\b/i);
      expect(pasted, `pasted="${pasted}"`).toContain('hello world from teams');
    } finally {
      await close();
    }
  });

  test('image-only clipboard saves PNG and pastes the file path', async () => {
    const { app, window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installPtyWriteSpy(window);

      await seedImageOnly(app, TINY_PNG_DATA_URL);
      await clearPtyWrites(window);
      await focusAndPaste(window);

      const pasted = await getPastedText(window);
      expect(pasted, `pasted="${pasted}"`).toMatch(/\.png\b/i);
    } finally {
      await close();
    }
  });

  test('plain text only pastes plain text', async () => {
    const { app, window, close } = await launchTmax();
    try {
      await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
      await window.waitForTimeout(800);
      await installPtyWriteSpy(window);

      await seedPlainText(app, 'just plain text 123');
      await clearPtyWrites(window);
      await focusAndPaste(window);

      const pasted = await getPastedText(window);
      expect(pasted, `pasted="${pasted}"`).toContain('just plain text 123');
    } finally {
      await close();
    }
  });
});
