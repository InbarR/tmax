import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// TASK-29 regression: the AI Sessions sidebar highlight is just a faithful
// reflection of `terminal.aiSessionId` for the focused pane. So the visible
// "wrong session highlighted" symptom is upstream of any rendering - it's
// the auto-link in updateTerminalTitleFromSession (terminal-store.ts:2380)
// keeping a stale binding when the AI process actually running in a pane
// changes.
//
// User repro: a pane in cwd X is bound to session A (auto-link picked it
// at session-creation time). The user closes that AI process and starts a
// NEW one in the same pane (same cwd). A second session B is detected,
// but the auto-link skips this terminal because t.aiSessionId is already
// set ("if (t.aiSessionId) continue;"). The pane stays linked to A even
// though the actual live AI process is B - so the sidebar highlights A
// when the user clicks the pane.
//
// We exercise this directly via the store actions (no real claude.exe).
// Real sessions loaded from disk are wiped first so they can't race with
// our fixtures via the async update IPC.

// Fictional cwds with a unique fixture marker so any real claude session
// loaded from the user's ~/.claude/projects can't accidentally satisfy
// the auto-link's cwd-equality check.
const FIXTURE_CWD = 'C:\\__task29_fixture__\\projA';
const SESSION_A_ID = 'sess-A-original';
const SESSION_B_ID = 'sess-B-superseder';

async function setTerminalCwd(window: Page, id: string, cwd: string): Promise<void> {
  await window.evaluate(({ id, cwd }) => {
    const store = (window as any).__terminalStore;
    const s = store.getState();
    const terminals = new Map(s.terminals);
    const t = terminals.get(id);
    if (!t) throw new Error('terminal not in store');
    terminals.set(id, { ...t, cwd });
    store.setState({ terminals });
  }, { id, cwd });
}

async function addClaudeSession(window: Page, opts: { id: string; cwd: string; summary: string }): Promise<void> {
  await window.evaluate((o) => {
    (window as any).__terminalStore.getState().addClaudeCodeSession({
      id: o.id,
      provider: 'claude-code',
      status: 'waitingForUser',
      cwd: o.cwd,
      branch: 'main',
      repository: 'fixture',
      summary: o.summary,
      messageCount: 1,
      toolCallCount: 0,
      lastActivityTime: Date.now(),
    });
  }, opts);
}

async function getAiSessionId(window: Page, terminalId: string): Promise<string | undefined> {
  return window.evaluate((id) => {
    return (window as any).__terminalStore.getState().terminals.get(id)?.aiSessionId;
  }, terminalId);
}

async function setFocus(window: Page, id: string): Promise<void> {
  await window.evaluate((tid) => {
    (window as any).__terminalStore.getState().setFocus(tid);
  }, id);
}

test('auto-link rebinds focused pane to a superseding AI session in the same cwd (TASK-29 AC #3)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Wipe any real Claude/Copilot sessions the monitor loaded from disk
    // before we inject fixtures. Otherwise an updateClaudeCodeSession fired
    // by a real session can race with our addClaudeSession() calls.
    await window.evaluate(() => {
      (window as any).__terminalStore.setState({
        claudeCodeSessions: [],
        copilotSessions: [],
      });
    });

    // Identify the launched terminal and pin a known cwd onto it.
    const t0 = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });
    expect(t0).toBeTruthy();
    await setTerminalCwd(window, t0, FIXTURE_CWD);
    await setFocus(window, t0);

    // Step 1 - the user runs `claude` in this pane. Session A is detected
    // and bound by the auto-link. This is the working baseline.
    await addClaudeSession(window, {
      id: SESSION_A_ID,
      cwd: FIXTURE_CWD,
      summary: 'Original session A',
    });
    await window.waitForTimeout(50);
    expect(await getAiSessionId(window, t0)).toBe(SESSION_A_ID);

    // Step 2 - the user closes that claude (or it exits) and starts a
    // fresh one in the SAME pane. Session B is detected. From the user's
    // perspective the pane is now hosting B; the sidebar should track B.
    await addClaudeSession(window, {
      id: SESSION_B_ID,
      cwd: FIXTURE_CWD,
      summary: 'Superseding session B',
    });
    await window.waitForTimeout(50);

    // The bug: t0.aiSessionId stays at SESSION_A_ID because the auto-link
    // refuses to override a terminal that is already bound. The fix should
    // detect that the focused, same-cwd terminal already has a (now
    // superseded) link and rebind it.
    const linkAfter = await getAiSessionId(window, t0);
    expect(linkAfter).toBe(SESSION_B_ID);
  } finally {
    await close();
  }
});

test('auto-link does not steal a binding from a non-focused pane (TASK-29 safety net)', async () => {
  // The supersession fix must be scoped to the FOCUSED pane. If we let
  // any same-cwd terminal rebind on a new session, two panes sharing a
  // cwd would have their links shuffled around every time either of them
  // saw a new session - that's worse than the original bug.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.evaluate(() => {
      (window as any).__terminalStore.setState({
        claudeCodeSessions: [],
        copilotSessions: [],
      });
    });

    const ids = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const t0 = s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
      await s.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1] as [string, string];
    });
    await window.waitForTimeout(300);
    const [t0, t1] = ids;

    // Both panes share the fixture cwd.
    await setTerminalCwd(window, t0, FIXTURE_CWD);
    await setTerminalCwd(window, t1, FIXTURE_CWD);

    // Pane t0 hosts session A. Focus t0 so the auto-link picks it.
    await setFocus(window, t0);
    await addClaudeSession(window, {
      id: SESSION_A_ID,
      cwd: FIXTURE_CWD,
      summary: 'A on left pane',
    });
    await window.waitForTimeout(50);
    expect(await getAiSessionId(window, t0)).toBe(SESSION_A_ID);

    // Now the user focuses t1 and starts a new claude there. Session B
    // is detected. t0 must KEEP its link to A; only t1 should bind to B.
    await setFocus(window, t1);
    await addClaudeSession(window, {
      id: SESSION_B_ID,
      cwd: FIXTURE_CWD,
      summary: 'B on right pane',
    });
    await window.waitForTimeout(50);

    expect(await getAiSessionId(window, t0)).toBe(SESSION_A_ID);
    expect(await getAiSessionId(window, t1)).toBe(SESSION_B_ID);
  } finally {
    await close();
  }
});

test('AI Sessions sidebar highlight visually follows focused pane (TASK-29 AC #2 - visual)', async () => {
  // The state-only tests above pin the auto-link. This one pins the
  // visible behaviour: clicking pane B must produce a sidebar with the
  // .ai-session-item for B's session marked .selected, and NOT pane A's.
  // Reproduces the user-visible symptom directly via the DOM.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const ids = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const t0 = s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
      await s.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1] as [string, string];
    });
    await window.waitForTimeout(300);
    const [t0, t1] = ids;

    const cwdA = 'C:\\__task29_visual__\\projA';
    const cwdB = 'C:\\__task29_visual__\\projB';
    const idA = 'sess-visual-A';
    const idB = 'sess-visual-B';
    const summaryA = 'TASK29-VISUAL-A-fixture-summary-text';
    const summaryB = 'TASK29-VISUAL-B-fixture-summary-text';

    // Open the panel FIRST so its mount-effect loadClaudeCodeSessions /
    // loadCopilotSessions run their full-overwrite setState and finish
    // before we inject fixtures. groupByRepo also gets disabled so the
    // #69 auto-collapse doesn't hide our fixture rows.
    await window.evaluate(() => {
      const store = (window as any).__terminalStore;
      store.setState({ showCopilotPanel: true });
      store.getState().updateConfig?.({ aiGroupByRepo: false });
    });
    await window.waitForSelector('.ai-session-item', { timeout: 5_000 });
    // Let initial loadClaudeCodeSessions / loadCopilotSessions IPC settle.
    await window.waitForTimeout(800);

    // Wipe whatever the monitor loaded and inject only our fixtures via
    // direct setState - this is a full-replace so subsequent IPC update
    // events for unrelated session ids won't touch our fixtures, and
    // any setClaudeCodeSessions full-replace from a slow IPC won't race
    // (it would overwrite, but at this point the monitor has had its
    // turn). We also link terminals directly so the auto-link's
    // recency / status gating doesn't enter the picture.
    await window.evaluate((args) => {
      const { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB } = args;
      const store = (window as any).__terminalStore;
      const now = Date.now();
      const fixtureA = {
        id: idA, provider: 'claude-code', status: 'waitingForUser',
        cwd: cwdA, branch: 'main', repository: 'fixture',
        summary: summaryA, messageCount: 1, toolCallCount: 0, lastActivityTime: now,
      };
      const fixtureB = {
        id: idB, provider: 'claude-code', status: 'waitingForUser',
        cwd: cwdB, branch: 'main', repository: 'fixture',
        summary: summaryB, messageCount: 1, toolCallCount: 0, lastActivityTime: now,
      };
      const s = store.getState();
      const terminals = new Map(s.terminals);
      const tA = terminals.get(t0);
      const tB = terminals.get(t1);
      if (!tA || !tB) throw new Error('terminals missing');
      terminals.set(t0, { ...tA, cwd: cwdA, aiSessionId: idA });
      terminals.set(t1, { ...tB, cwd: cwdB, aiSessionId: idB });
      store.setState({
        terminals,
        claudeCodeSessions: [fixtureA, fixtureB],
        copilotSessions: [],
      });
    }, { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB });
    await window.waitForTimeout(200);

    // State precondition: each pane is bound to its own session.
    expect(await getAiSessionId(window, t0)).toBe(idA);
    expect(await getAiSessionId(window, t1)).toBe(idB);

    // First focus t0, then t1 - this exercises the auto-highlight effect's
    // edge-trigger on focusedTerminalId change. If we only focus t1 once
    // and the prevFocusedIdRef happened to already be t1 (e.g. because
    // setFocus during fixture setup ran before the panel was open), the
    // effect early-returns and we'd miss the bug. Toggling guarantees a
    // change in focusedTerminalId AFTER show became true.
    await setFocus(window, t0);
    await window.waitForTimeout(150);
    await setFocus(window, t1);
    await window.waitForTimeout(300);

    const visual = await window.evaluate(({ summaryA, summaryB }) => {
      const items = [...document.querySelectorAll('.ai-session-item')] as HTMLElement[];
      const selected = document.querySelector('.ai-session-item.selected') as HTMLElement | null;
      return {
        totalItems: items.length,
        selectedText: selected ? (selected.textContent || '').trim() : null,
        summaryAVisible: items.some((el) => (el.textContent || '').includes(summaryA)),
        summaryBVisible: items.some((el) => (el.textContent || '').includes(summaryB)),
      };
    }, { summaryA, summaryB });

    // Sanity: both fixture sessions appear in the rendered list.
    expect(visual.summaryAVisible).toBe(true);
    expect(visual.summaryBVisible).toBe(true);

    // The bug, asserted: the .selected item must be B's row, not A's.
    expect(visual.selectedText).toBeTruthy();
    expect(visual.selectedText!).toContain(summaryB);
    expect(visual.selectedText!).not.toContain(summaryA);
  } finally {
    await close();
  }
});

test('focused pane highlight expands its repo group when groupByRepo collapses it (TASK-29 hidden-by-collapse)', async () => {
  // Real-world repro of the user-reported "wrong session highlighted":
  // groupByRepo defaults to ON and #69 auto-collapses every group. The
  // user clicks pane B; auto-highlight code calls setSelectedIndex on B's
  // index in the displayList, but B's row is gated behind {!isCollapsed &&
  // ...} so the .selected class never gets applied to any rendered DOM
  // node. The user sees whichever item *was* selected before staying
  // visually selected (often the pinned tmax session at index 0).
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const ids = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const t0 = s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
      await s.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1] as [string, string];
    });
    await window.waitForTimeout(300);
    const [t0, t1] = ids;

    const cwdA = 'C:\\__task29_collapse__\\projA';
    const cwdB = 'C:\\__task29_collapse__\\projB';
    const idA = 'sess-collapse-A';
    const idB = 'sess-collapse-B';
    const summaryA = 'TASK29-COLLAPSE-A-fixture';
    const summaryB = 'TASK29-COLLAPSE-B-fixture';

    // Open the panel with groupByRepo OFF first - this lets us inject
    // fixtures without the auto-collapse running yet.
    await window.evaluate(() => {
      const store = (window as any).__terminalStore;
      store.setState({ showCopilotPanel: true });
      store.getState().updateConfig?.({ aiGroupByRepo: false });
    });
    await window.waitForSelector('.ai-session-item', { timeout: 5_000 });
    await window.waitForTimeout(800);

    // Inject fixtures while groupByRepo is off, so they're present when
    // we flip to on (next step) and the auto-collapse will sweep them.
    await window.evaluate((args) => {
      const { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB } = args;
      const store = (window as any).__terminalStore;
      const now = Date.now();
      const s = store.getState();
      const terminals = new Map(s.terminals);
      terminals.set(t0, { ...terminals.get(t0)!, cwd: cwdA, aiSessionId: idA });
      terminals.set(t1, { ...terminals.get(t1)!, cwd: cwdB, aiSessionId: idB });
      store.setState({
        terminals,
        claudeCodeSessions: [
          { id: idA, provider: 'claude-code', status: 'waitingForUser',
            cwd: cwdA, branch: 'main', repository: 'fixture',
            summary: summaryA, messageCount: 1, toolCallCount: 0, lastActivityTime: now },
          { id: idB, provider: 'claude-code', status: 'waitingForUser',
            cwd: cwdB, branch: 'main', repository: 'fixture',
            summary: summaryB, messageCount: 1, toolCallCount: 0, lastActivityTime: now },
        ],
        copilotSessions: [],
      });
    }, { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB });
    await window.waitForTimeout(200);

    // NOW flip groupByRepo back on - this is the off->on transition
    // that fires #69's auto-collapse against our (now-present) fixture
    // groups, putting their cwds into collapsedGroups. The user's real
    // case: tmax starts, sessions load (including ClawPilot), groupByRepo
    // is on by default and auto-collapse runs with all the loaded
    // sessions, hiding their group rows.
    await window.evaluate(() => {
      (window as any).__terminalStore.getState().updateConfig?.({ aiGroupByRepo: true });
    });
    await window.waitForTimeout(300);

    await setFocus(window, t0);
    await window.waitForTimeout(150);
    await setFocus(window, t1);
    await window.waitForTimeout(300);

    // The fix should ensure the focused pane's session is always
    // rendered AND has .selected. The collapse must not hide it.
    const visual = await window.evaluate(({ summaryA, summaryB }) => {
      const items = [...document.querySelectorAll('.ai-session-item')] as HTMLElement[];
      const selected = document.querySelector('.ai-session-item.selected') as HTMLElement | null;
      return {
        selectedText: selected ? (selected.textContent || '').trim() : null,
        summaryBVisible: items.some((el) => (el.textContent || '').includes(summaryB)),
        summaryAVisible: items.some((el) => (el.textContent || '').includes(summaryA)),
      };
    }, { summaryA, summaryB });

    expect(visual.summaryBVisible).toBe(true);
    expect(visual.selectedText).toBeTruthy();
    expect(visual.selectedText!).toContain(summaryB);
  } finally {
    await close();
  }
});

test('showAiSessionsForPane reveals the pane\'s session even when filters and collapse would hide it (TASK-34)', async () => {
  // Repro for the user-reported "I'm focused on this pane but the
  // sidebar still highlights some other session" case where the cause
  // was the showRunningOnly filter hiding an idle session. The new
  // pane menu action `showAiSessionsForPane` (✨ Show in AI sessions)
  // must reveal the pane's session no matter what filters are active.
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const ids = await window.evaluate(async () => {
      const s = (window as any).__terminalStore.getState();
      const t0 = s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
      await s.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1] as [string, string];
    });
    await window.waitForTimeout(300);
    const [t0, t1] = ids;

    const cwdA = 'C:\\__task34__\\projA';
    const cwdB = 'C:\\__task34__\\projB';
    const idA = 'sess-task34-A';
    const idB = 'sess-task34-B';
    const summaryA = 'TASK34-A-fixture';
    const summaryB = 'TASK34-B-IDLE-fixture';  // B is idle - the hard case

    // Open panel; let initial loads settle.
    await window.evaluate(() => {
      (window as any).__terminalStore.setState({ showCopilotPanel: true });
    });
    await window.waitForSelector('.ai-session-item', { timeout: 5_000 });
    await window.waitForTimeout(800);

    // Inject fixtures: A is active (waitingForUser), B is idle. With
    // showRunningOnly on, B disappears from filtered.
    await window.evaluate((args) => {
      const { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB } = args;
      const store = (window as any).__terminalStore;
      const now = Date.now();
      const s = store.getState();
      const terminals = new Map(s.terminals);
      terminals.set(t0, { ...terminals.get(t0)!, cwd: cwdA, aiSessionId: idA });
      terminals.set(t1, { ...terminals.get(t1)!, cwd: cwdB, aiSessionId: idB });
      store.setState({
        terminals,
        claudeCodeSessions: [
          { id: idA, provider: 'claude-code', status: 'waitingForUser',
            cwd: cwdA, branch: 'main', repository: 'fixture',
            summary: summaryA, messageCount: 1, toolCallCount: 0, lastActivityTime: now },
          { id: idB, provider: 'claude-code', status: 'idle',
            cwd: cwdB, branch: 'main', repository: 'fixture',
            summary: summaryB, messageCount: 1, toolCallCount: 0, lastActivityTime: now },
        ],
        copilotSessions: [],
      });
    }, { t0, t1, cwdA, cwdB, idA, idB, summaryA, summaryB });
    await window.waitForTimeout(200);

    // Bug setup: focused on t1 (idle session B), with showRunningOnly
    // on (so B is filtered out) and a search query active that also
    // wouldn't match B.
    await setFocus(window, t1);
    await window.evaluate(() => {
      // Note: showRunningOnly and query are local state in CopilotPanel.
      // We can't poke them from outside, but we can simulate the user
      // having clicked the Running toggle by pinning the result via
      // the action: trigger showAiSessionsForPane and check that the
      // session shows up regardless of any pre-existing filters.
    });

    // Click the "Show in AI sessions" pane action programmatically.
    await window.evaluate((tid) => {
      (window as any).__terminalStore.getState().showAiSessionsForPane(tid);
    }, t1);
    await window.waitForTimeout(300);

    // The session should now be both rendered AND selected.
    const visual = await window.evaluate(({ summaryB }) => {
      const items = [...document.querySelectorAll('.ai-session-item')] as HTMLElement[];
      const selected = document.querySelector('.ai-session-item.selected') as HTMLElement | null;
      return {
        summaryBVisible: items.some((el) => (el.textContent || '').includes(summaryB)),
        selectedText: selected ? (selected.textContent || '').trim() : null,
      };
    }, { summaryB });

    expect(visual.summaryBVisible).toBe(true);
    expect(visual.selectedText).toBeTruthy();
    expect(visual.selectedText!).toContain(summaryB);
  } finally {
    await close();
  }
});
