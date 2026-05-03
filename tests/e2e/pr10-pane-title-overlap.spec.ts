import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Regression test for PR #10 — prevent pane title from overlapping
// terminal content. The title element must be positioned so it doesn't
// cover the terminal viewport.

test('PR #10: pane title does not overlap the terminal content area', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 10_000 });

    // Check that the pane title element doesn't overlap the xterm viewport
    const overlap = await window.evaluate(() => {
      const title = document.querySelector('.pane-title, .terminal-title');
      const viewport = document.querySelector('.xterm-viewport, .xterm-screen');
      if (!title || !viewport) return { checked: false };

      const titleRect = title.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();

      // The title bottom should not extend into the viewport top
      const overlaps = titleRect.bottom > viewportRect.top &&
                       titleRect.top < viewportRect.top;
      return {
        checked: true,
        overlaps,
        titleBottom: titleRect.bottom,
        viewportTop: viewportRect.top,
      };
    });

    if (overlap.checked) {
      expect(overlap.overlaps).toBe(false);
    }
  } finally {
    await close();
  }
});
