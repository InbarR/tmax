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

    // Group is on by default (#69) - click the Group button once to turn it
    // OFF, so the test starts from a known headerless state, then click again
    // to turn it back on and exercise the grouping path.
    const findGroupBtn = async () => {
      for (const b of await window.$$('.ai-session-tab')) {
        const text = (await b.textContent() || '').trim();
        if (text === 'Group') return b;
      }
      return null;
    };
    const groupOff = await findGroupBtn();
    expect(groupOff).not.toBeNull();
    await groupOff!.click();
    await window.waitForTimeout(300);

    const headersBefore = await window.$$('.ai-session-group-header');
    expect(headersBefore.length).toBe(0);

    // Click Group again - now we're testing the off→on transition.
    const groupOn = await findGroupBtn();
    expect(groupOn).not.toBeNull();
    await groupOn!.click();
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

    // Clicking Group again should turn headers off
    for (const b of await window.$$('.ai-session-tab')) {
      const text = (await b.textContent() || '').trim();
      if (text === 'Group') { await b.click(); break; }
    }
    await window.waitForTimeout(300);
    const headersAfter = await window.$$('.ai-session-group-header');
    expect(headersAfter.length).toBe(0);
  } finally {
    await close();
  }
});
