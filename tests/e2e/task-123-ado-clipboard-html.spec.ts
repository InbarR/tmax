// TASK-123: ADO/IcM "Copy to clipboard" pastes the URL even when the HTML
// has trailing description text outside the <a> tag.
//
// Real ADO/IcM HTML for an incident or PR copy looks like:
//   <a href="https://...">Incident 12345</a> : Service is down
//
// Pre-fix (post-TASK-61), the strict equality check
// stripHtmlVisibleText(html) === stripHtmlVisibleText(inner) failed - the
// trailing " : Service is down" lives outside the link, so visibleText
// includes it. Paste fell through to plain text, which has no clickable
// URL in xterm. The widened rule extracts the URL when the link starts
// the visible text and the trailing text begins with a separator
// (`:`, `-`, `|`, etc.) - the "label : description" pattern - while
// continuing to reject prose-with-embedded-link ("Click here for more").
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

async function seedHtmlAndText(app: ElectronApplication, html: string, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, args) => {
    clipboard.write({ html: args.html, text: args.text });
  }, { html, text });
}

async function focusAndPaste(window: Page): Promise<void> {
  await window.click('.terminal-panel .xterm-screen');
  await window.waitForTimeout(150);
  await window.keyboard.press('Control+v');
  await window.waitForTimeout(300);
}

test('TASK-123: IcM "Copy to clipboard" with trailing description pastes the URL', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    // Real-world payload from IcM "Copy to clipboard" - link wraps the
    // identifier, the description follows outside the <a>.
    const html = '<html><head></head><body><a href="https://portal.microsofticm.com/imp/v5/incidents/details/744762850/summary">Incident 744762850</a> : Medeina Dev is down</body></html>';
    const plainText = 'Incident 744762850 : Medeina Dev is down';
    await seedHtmlAndText(app, html, plainText);
    await window.evaluate(() => { (window as any).__ptyWrites = []; });
    await focusAndPaste(window);

    const pasted = await getPastedText(window);
    expect(
      pasted,
      `expected pasted text to contain the URL; got: ${JSON.stringify(pasted)}`,
    ).toContain('https://portal.microsofticm.com/imp/v5/incidents/details/744762850/summary');
    expect(pasted).not.toContain('Medeina Dev is down');
  } finally {
    await close();
  }
});

test('TASK-123: ADO PR "Copy to clipboard" - title-only link still pastes URL (no regression)', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    // Original TASK-61-passing shape: HTML is just the <a> wrapping the title.
    const html = '<a href="https://dev.azure.com/org/_git/repo/pullrequest/15621953">Pull Request 15621953: Add secondary Kusto clusters</a>';
    const plainText = 'Pull Request 15621953: Add secondary Kusto clusters';
    await seedHtmlAndText(app, html, plainText);
    await window.evaluate(() => { (window as any).__ptyWrites = []; });
    await focusAndPaste(window);

    const pasted = await getPastedText(window);
    expect(pasted).toContain('https://dev.azure.com/org/_git/repo/pullrequest/15621953');
  } finally {
    await close();
  }
});

test('TASK-123: prose with embedded link ("Click here for more") still pastes the prose (TASK-61 not regressed)', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    // Teams chat shape: link is buried mid-sentence, no separator.
    const html = '<p>Hey check <a href="https://example.com/article">this page</a> please</p>';
    const plainText = 'Hey check this page please';
    await seedHtmlAndText(app, html, plainText);
    await window.evaluate(() => { (window as any).__ptyWrites = []; });
    await focusAndPaste(window);

    const pasted = await getPastedText(window);
    expect(pasted).not.toContain('https://example.com/article');
    expect(pasted).toContain('Hey check this page please');
  } finally {
    await close();
  }
});

test('TASK-123: link at start followed by continuation word does NOT extract URL', async () => {
  // Edge case: "Read here for more" - link inner "Read here" is at the start,
  // but trailing text " for more" begins with a continuation word, not a
  // separator. Should paste prose, not URL.
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    await installPtyWriteSpy(window);

    const html = '<a href="https://example.com/doc">Read here</a> for more details';
    const plainText = 'Read here for more details';
    await seedHtmlAndText(app, html, plainText);
    await window.evaluate(() => { (window as any).__ptyWrites = []; });
    await focusAndPaste(window);

    const pasted = await getPastedText(window);
    expect(pasted).not.toContain('https://example.com/doc');
    expect(pasted).toContain('Read here for more details');
  } finally {
    await close();
  }
});
