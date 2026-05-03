import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

test('Group toggle renders group headers and contiguous sessions per repo (#69)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Open the AI sessions panel (Copilot/Claude panel)
    await window.evaluate(() => (window as any).__terminalStore.getState().toggleCopilotPanel());
    await window.waitForTimeout(500);

    // If there are no AI sessions on this machine, skip the assertion portion.
    const initialItems = await window.$$('.ai-session-item, .ai-session-group-header');
    if (initialItems.length === 0) {
      console.log('no AI sessions found on this machine; skipping');
      return;
    }

    // Group is on by default (#69) - toggle the Group setting once to turn it
    // OFF, so the test starts from a known headerless state, then toggle again
    // to turn it back on and exercise the grouping path. The Group toggle now
    // lives inside the header's "More actions" dropdown.
    const toggleGroup = async () => {
      const moreBtn = await window.$('.dir-panel-header [aria-label="More actions"]');
      expect(moreBtn).not.toBeNull();
      await moreBtn!.click();
      await window.waitForTimeout(150);
      for (const item of await window.$$('.context-menu-item')) {
        const text = (await item.textContent() || '').trim();
        if (text.includes('Group sessions by repo')) {
          await item.click();
          return;
        }
      }
      throw new Error('Group sessions by repo menu item not found');
    };
    await toggleGroup();
    await window.waitForTimeout(300);

    const headersBefore = await window.$$('.ai-session-group-header');
    expect(headersBefore.length).toBe(0);

    // Toggle Group again - now we're testing the off→on transition.
    await toggleGroup();
    await window.waitForTimeout(400);

    // Now headers should appear. Groups auto-collapse on first toggle, so by
    // default we expect only headers (no sessions) until a group is expanded.
    const headers = await window.$$('.ai-session-group-header');
    expect(headers.length).toBeGreaterThan(0);

    const items = await window.$$('.dir-panel-list > *');
    const layout: string[] = [];
    for (const it of items) {
      const cls = (await it.getAttribute('class')) || '';
      if (cls.includes('ai-session-group-header')) layout.push(`H:${((await it.textContent()) || '').trim()}`);
      else if (cls.includes('ai-session-item')) layout.push('S');
    }
    console.log('group layout:', layout);

    // Click the first header to expand it - at least one session should appear right after
    await headers[0].click();
    await window.waitForTimeout(300);
    const expandedItems = await window.$$('.dir-panel-list > *');
    const expandedLayout: string[] = [];
    for (const it of expandedItems) {
      const cls = (await it.getAttribute('class')) || '';
      if (cls.includes('ai-session-group-header')) expandedLayout.push('H');
      else if (cls.includes('ai-session-item')) expandedLayout.push('S');
    }
    // First element is a header, second should be a session (after expanding)
    expect(expandedLayout[0]).toBe('H');
    expect(expandedLayout[1]).toBe('S');

    // Toggling Group again should turn headers off
    await toggleGroup();
    await window.waitForTimeout(300);
    const headersAfter = await window.$$('.ai-session-group-header');
    expect(headersAfter.length).toBe(0);
  } finally {
    await close();
  }
});
