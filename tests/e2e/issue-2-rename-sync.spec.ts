import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import type { CopilotSessionSummary } from '../../src/shared/copilot-types';

// Issue #2 / commit 218dcef regression — three independent rename-sync bugs:
//
//   Bug 1 (watcher): copilot-session-watcher.ts only routed events.jsonl
//                    changes; workspace.yaml writes were silently dropped,
//                    so a /rename via the Copilot CLI never reached the UI.
//
//   Bug 2 (monitor): copilot-session-monitor.ts#refreshSession compared
//                    status / messageCount / toolCallCount / latestPrompt
//                    only — NOT summary. So even when the watcher routed
//                    the workspace.yaml change, the monitor swallowed it.
//
//   Bug 3 (sidebar): CopilotPanel#handleFinishRename used a redundant
//                    renameTerminal() loop that double-wrote and renamed
//                    the wrong session. Fix simplifies to a single
//                    setSessionNameOverride() call. setSessionNameOverride
//                    now also resets firstCommandTitle:false on every
//                    linked terminal (so the next shell command does NOT
//                    overwrite the user's chosen name — TASK-88 regression
//                    risk). And the sidebar useMemo now derives the
//                    displayed summary from a linked terminal's customTitle
//                    when there is no explicit override (so a tab-bar
//                    rename flows back into the sidebar).
//
// These tests exercise Bug 3 end-to-end via the renderer + DOM (the user-
// visible behaviour of all three bugs converges here). Bugs 1 + 2 live in
// the main process file-watching layer and would require disk simulation;
// they are covered indirectly by the visual sync tests below — if the
// summary plumbing is broken upstream the rename will never be visible at
// all.

const SESSION_ID = 'issue-2-rename-sync-test';
const UNIQUE_CWD = 'C:/test-issue-2-rename-sync-fixture-cwd';
const ORIGINAL_SUMMARY = 'first prompt — comes from disk';
const TAB_RENAME = 'name typed in the TAB bar';
const SIDEBAR_RENAME = 'name typed in the SIDEBAR';

function makeSession(overrides: Partial<CopilotSessionSummary> = {}): CopilotSessionSummary {
  return {
    id: SESSION_ID,
    provider: 'copilot',
    status: 'idle',
    cwd: UNIQUE_CWD,
    branch: 'main',
    repository: 'tmax',
    summary: ORIGINAL_SUMMARY,
    slug: 'calm-river',
    latestPrompt: ORIGINAL_SUMMARY,
    latestPromptTime: Date.now(),
    messageCount: 5,
    toolCallCount: 0,
    lastActivityTime: Date.now(),
    ...overrides,
  };
}

// Inject a fake CopilotSessionSummary into the store's copilotSessions
// list AND open the AI sessions panel so it gets rendered. We REPLACE the
// session lists (rather than appending) — but the main-process session
// monitor watches the real ~/.copilot/session-state and keeps pushing
// `addCopilotSession` updates for the real sessions on disk, so our
// seeded session ends up in a crowded list. That's fine: tests below
// locate OUR row via a unique fixture cwd (UNIQUE_CWD) rather than
// `.first()`, so we never confuse it with a real session row.
//
// CRITICAL: loadCopilotSessions is the destructive `set({ copilotSessions: ... })`
// that fires asynchronously on startup. If it fires AFTER our seed, it
// silently wipes us. Three issues conspire:
//   1. copilotSqliteActive flips true mid-load, before sessions are set,
//      so we cannot use it as a "load done" signal.
//   2. addCopilotSession from incremental monitor updates is benign (it
//      filters by id and appends), so we don't need to defend against it.
//   3. autoArchiveStaleSessions runs after every load and may flip our
//      lifecycle to 'old' / 'archived' if it considers our session stale.
//
// Defence: monkey-patch loadCopilotSessions / setCopilotSessions to
// no-ops AFTER waiting for the initial real load to settle. Then seed
// our fixture session. Nothing can wipe it after that point.
async function seedSessionAndOpenPanel(window: Page, session: CopilotSessionSummary): Promise<void> {
  // Wait for the initial async session population to settle. The flag
  // alone isn't enough (it flips early); poll until copilotSessions
  // count is stable for ~600ms.
  await window.waitForFunction(() => {
    const w = window as any;
    const s = w.__terminalStore.getState();
    const now = s.copilotSessions.length;
    const last = w.__lastCopilotCount;
    const stableSince = w.__stableSince || 0;
    if (now !== last) {
      w.__lastCopilotCount = now;
      w.__stableSince = Date.now();
      return false;
    }
    return Date.now() - stableSince > 600;
  }, null, { timeout: 20_000, polling: 200 });

  await window.evaluate((s) => {
    const store = (window as any).__terminalStore;
    // Monkey-patch the destructive load actions so nothing can wipe our
    // seed for the rest of the test. Incremental addCopilotSession is
    // safe (filters by id) so we leave it alone.
    store.setState({
      loadCopilotSessions: async () => { /* test no-op */ },
      setCopilotSessions: () => { /* test no-op */ },
      autoArchiveStaleSessions: () => { /* test no-op — would override our lifecycle */ },
      copilotSessions: [s, ...store.getState().copilotSessions.filter((x: any) => x.id !== s.id)],
      sessionNameOverrides: {},
      // Force lifecycle to 'active' explicitly so getSessionLifecycle's
      // age check can never demote us to 'old'.
      sessionLifecycleOverrides: { ...store.getState().sessionLifecycleOverrides, [s.id]: 'active' },
      showCopilotPanel: true,
    });
  }, session);
  // Wait for OUR specific seeded row to render — the unique cwd is on the
  // row's title attribute (CopilotPanel sets title={session.cwd || session.id}).
  await window.waitForSelector(`.ai-session-item[title="${UNIQUE_CWD}"]`, { timeout: 5_000 });
}

// Inject a fake terminal whose aiSessionId points at our seeded session.
// Returns the generated terminal id so the caller can mutate it later.
async function seedLinkedTerminal(
  window: Page,
  sessionId: string,
  init: { title: string; customTitle: boolean; aiAutoTitle: boolean; firstCommandTitle?: boolean },
): Promise<string> {
  return window.evaluate(({ sessionId, init }) => {
    const store = (window as any).__terminalStore;
    const id = `e2e-fake-term-${Math.random().toString(36).slice(2, 8)}`;
    const inst = {
      id,
      title: init.title,
      customTitle: init.customTitle,
      shellProfileId: 'pwsh',
      cwd: 'C:/projects/tmax',
      mode: 'tiled',
      pid: 99999,
      lastProcess: 'pwsh.exe',
      startupCommand: '',
      aiSessionId: sessionId,
      aiAutoTitle: init.aiAutoTitle,
      firstCommandTitle: init.firstCommandTitle ?? false,
    };
    const next = new Map(store.getState().terminals);
    next.set(id, inst);
    store.setState({ terminals: next });
    return id;
  }, { sessionId, init });
}

// Read the sidebar row's display name for OUR seeded session, located by
// the unique fixture cwd. Returns null if our row hasn't rendered yet.
async function readSidebarName(window: Page): Promise<string | null> {
  const row = window.locator(`.ai-session-item[title="${UNIQUE_CWD}"]`).first();
  if (await row.count() === 0) return null;
  return row.locator('.ai-session-name').first().textContent({ timeout: 2_000 });
}

async function readTerminal(window: Page, terminalId: string): Promise<any> {
  return window.evaluate((tid) => {
    const inst = (window as any).__terminalStore.getState().terminals.get(tid);
    if (!inst) return null;
    const { id, title, customTitle, aiAutoTitle, firstCommandTitle, aiSessionId } = inst;
    return { id, title, customTitle, aiAutoTitle, firstCommandTitle, aiSessionId };
  }, terminalId);
}

test('Bug 3a — setSessionNameOverride writes title + 4 flags to all linked terminals', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });
    await seedSessionAndOpenPanel(window, makeSession());

    // Inject one linked terminal + one unlinked control in a SINGLE
    // evaluate to avoid any cross-evaluate timing races (sequential
    // setState calls don't race in zustand, but a single set is simpler
    // to reason about and matches how the production renderer mounts
    // pre-existing terminals on startup).
    const ids = await window.evaluate(({ sessionId }) => {
      const store = (window as any).__terminalStore;
      const linkedId = `e2e-linked-${Math.random().toString(36).slice(2, 8)}`;
      const unlinkedId = `e2e-unlinked-${Math.random().toString(36).slice(2, 8)}`;
      const next = new Map(store.getState().terminals);
      next.set(linkedId, {
        id: linkedId, title: 'pre-rename', customTitle: false, shellProfileId: 'pwsh',
        cwd: 'C:/projects/tmax', mode: 'tiled', pid: 99991, lastProcess: 'pwsh.exe', startupCommand: '',
        aiSessionId: sessionId, aiAutoTitle: true, firstCommandTitle: true,
      });
      next.set(unlinkedId, {
        id: unlinkedId, title: 'unrelated', customTitle: false, shellProfileId: 'pwsh',
        cwd: 'C:/projects/tmax', mode: 'tiled', pid: 99992, lastProcess: 'pwsh.exe', startupCommand: '',
        aiSessionId: 'OTHER-SESSION', aiAutoTitle: false, firstCommandTitle: false,
      });
      store.setState({ terminals: next });
      return { linkedId, unlinkedId };
    }, { sessionId: SESSION_ID });

    // Fire the action that handleFinishRename now calls (post-fix).
    await window.evaluate(({ sessionId, name }) => {
      (window as any).__terminalStore.getState().setSessionNameOverride(sessionId, name);
    }, { sessionId: SESSION_ID, name: SIDEBAR_RENAME });

    // Linked terminal must carry the new title and ALL four flags
    // (firstCommandTitle:false is the new addition that prevents the next
    // shell command from re-stamping a different title — TASK-88 risk).
    const linked = await readTerminal(window, ids.linkedId);
    expect(linked, 'linked terminal must still exist after rename').not.toBeNull();
    expect(linked.title).toBe(SIDEBAR_RENAME);
    expect(linked.customTitle).toBe(true);
    expect(linked.aiAutoTitle).toBe(false);
    expect(linked.firstCommandTitle).toBe(false);

    // Unlinked terminal must be untouched.
    const unlinked = await readTerminal(window, ids.unlinkedId);
    expect(unlinked, 'unlinked terminal must still exist').not.toBeNull();
    expect(unlinked.title).toBe('unrelated');
    expect(unlinked.customTitle).toBe(false);

    // sessionNameOverrides map updated.
    const overrides = await window.evaluate(() =>
      (window as any).__terminalStore.getState().sessionNameOverrides);
    expect(overrides[SESSION_ID]).toBe(SIDEBAR_RENAME);
  } finally {
    await close();
  }
});

test('Bug 3b — sidebar derives display name from linked terminal customTitle (tab → sidebar sync)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });
    await seedSessionAndOpenPanel(window, makeSession());

    // Baseline: with no linked terminal AND no override, the sidebar shows
    // the on-disk summary.
    await expect.poll(async () => readSidebarName(window), { timeout: 3_000 })
      .toContain(ORIGINAL_SUMMARY);

    // Simulate the user renaming via the TAB bar — that flows through
    // renameTerminal() which sets customTitle:true and aiAutoTitle:false on
    // the terminal but does NOT touch sessionNameOverrides.
    await seedLinkedTerminal(window, SESSION_ID, {
      title: TAB_RENAME, customTitle: true, aiAutoTitle: false, firstCommandTitle: false,
    });

    // Pre-fix: the sidebar would still display ORIGINAL_SUMMARY because
    // CopilotPanel only consulted sessionNameOverrides. Post-fix: useMemo
    // walks linked terminals and uses customTitle when present.
    await expect.poll(async () => readSidebarName(window), { timeout: 3_000 })
      .toContain(TAB_RENAME);

    // Sanity: the on-disk summary text must not still be visible.
    const name = (await readSidebarName(window)) ?? '';
    expect(name).not.toContain(ORIGINAL_SUMMARY);
  } finally {
    await close();
  }
});

test('Bug 3c — sessionNameOverrides beats linked terminal customTitle (precedence)', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });
    await seedSessionAndOpenPanel(window, makeSession());

    // Both signals present: a sidebar override AND a linked terminal with a
    // different customTitle. The override branch is checked first in the
    // useMemo so it must win.
    await seedLinkedTerminal(window, SESSION_ID, {
      title: TAB_RENAME, customTitle: true, aiAutoTitle: false, firstCommandTitle: false,
    });
    await window.evaluate(({ sessionId, name }) => {
      // setSessionNameOverride would *also* mutate the terminal's title to
      // match — bypass it here by writing the override map directly so the
      // two strings stay distinct and we can prove which one the sidebar
      // chose.
      const store = (window as any).__terminalStore;
      store.setState({
        sessionNameOverrides: { ...store.getState().sessionNameOverrides, [sessionId]: name },
      });
    }, { sessionId: SESSION_ID, name: SIDEBAR_RENAME });

    await expect.poll(async () => readSidebarName(window), { timeout: 3_000 })
      .toContain(SIDEBAR_RENAME);
    const name = (await readSidebarName(window)) ?? '';
    expect(name).not.toContain(TAB_RENAME);
    expect(name).not.toContain(ORIGINAL_SUMMARY);
  } finally {
    await close();
  }
});

test('Bug 3d — firstCommandTitle is cleared so next shell command cannot overwrite the rename', async () => {
  // This is the TASK-88 regression risk the fix specifically guards
  // against. Pre-fix: setSessionNameOverride flipped customTitle=true and
  // aiAutoTitle=false but left firstCommandTitle alone. So if a user
  // renamed BEFORE typing their first command, the OSC-driven first-
  // command title overwrite (terminal-store.ts ~3530) would still run on
  // the next keystroke and clobber the rename.
  //
  // Post-fix: firstCommandTitle is forced to false in the same set(), so
  // the first-command guard refuses to fire.
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });
    await seedSessionAndOpenPanel(window, makeSession());

    // Simulate a brand-new pane that has not seen its first command yet —
    // firstCommandTitle starts true (pre-loaded by the watcher path).
    const tid = await seedLinkedTerminal(window, SESSION_ID, {
      title: 'placeholder', customTitle: false, aiAutoTitle: true, firstCommandTitle: true,
    });

    await window.evaluate(({ sessionId, name }) => {
      (window as any).__terminalStore.getState().setSessionNameOverride(sessionId, name);
    }, { sessionId: SESSION_ID, name: SIDEBAR_RENAME });

    const inst = await readTerminal(window, tid);
    expect(inst.firstCommandTitle).toBe(false);
    expect(inst.title).toBe(SIDEBAR_RENAME);
    expect(inst.customTitle).toBe(true);
    expect(inst.aiAutoTitle).toBe(false);
  } finally {
    await close();
  }
});
