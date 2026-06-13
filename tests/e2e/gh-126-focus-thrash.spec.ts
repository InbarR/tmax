import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// GH #126 / #70: input-stuck "can't type" freeze. Root cause: when the tmax
// window loses OS focus but is still visible (another app, a notification, or
// a second tmax instance has OS focus), the focused pane's blur->refocus
// handler refocuses the xterm textarea anyway. That refocus can't give the
// WINDOW os-focus, so it blurs again -> refocus -> a thrash loop that fires
// DEC focus escapes (\x1b[I/\x1b[O) and shreds real keystrokes.
//
// Correct behaviour: do NOT refocus the terminal while the window is not
// OS-focused, UNLESS the user has typed in this pane very recently (the RDP
// case, where document.hasFocus() is false even while actively typing).
test('GH #126: does not refocus the terminal while the window is not OS-focused', async () => {
  const { app, window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel .xterm-screen', { timeout: 15_000 });
    await window.waitForTimeout(600);

    // Focus a pane the normal way.
    await window.click('.terminal-panel .xterm-screen');
    await window.waitForTimeout(200);

    const activeBefore = await window.evaluate(() =>
      document.activeElement?.tagName === 'TEXTAREA' && !!document.activeElement.closest('.terminal-panel'),
    );
    expect(activeBefore, 'terminal textarea should be focused after click').toBe(true);

    // Simulate "window is visible but does NOT have OS focus" (another app /
    // notification / second tmax instance has it) by making document.hasFocus()
    // report false - exactly the hasFocus:false + visible:true state seen in the
    // freeze diag - then blur the textarea so the pane's blur->refocus handler
    // runs and decides whether to fight for focus.
    const after = await window.evaluate(async () => {
      (document as any).hasFocus = () => false;
      const ta = document.activeElement as HTMLTextAreaElement | null;
      ta?.blur();
      // Let the handler's requestAnimationFrame run, then settle.
      await new Promise((r) => setTimeout(r, 300));
      return {
        activeIsTermTextarea:
          document.activeElement?.tagName === 'TEXTAREA' &&
          !!document.activeElement.closest('.terminal-panel'),
      };
    });

    // eslint-disable-next-line no-console
    console.log('\n[GH-126] after blur with hasFocus=false:', JSON.stringify(after), '\n');

    // The bug: tmax refocuses the textarea even though the window lacks OS focus,
    // starting the thrash loop. The fix must leave it un-refocused here (no
    // recent keystroke = not the RDP "actively typing" case).
    expect(
      after.activeIsTermTextarea,
      'terminal must NOT be auto-refocused while the window lacks OS focus (would thrash)',
    ).toBe(false);
  } finally {
    await close();
  }
});
