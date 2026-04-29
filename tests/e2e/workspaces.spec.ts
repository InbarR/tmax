import { test, expect, Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { launchTmax } from './fixtures/launch';

// TASK-40 regression: workspaces let each tab represent a collection of
// panes. Default tabMode='flat' keeps today's behaviour (one workspace).
// Switching tabMode='workspaces' renders the workspace tab bar; chips
// swap the entire grid.

async function getStore(window: Page): Promise<any> {
  return window.evaluate(() => (window as any).__terminalStore.getState());
}

async function createWorkspace(window: Page): Promise<string> {
  return window.evaluate(() => {
    const id = (window as any).__terminalStore.getState().createWorkspace();
    return id as string;
  });
}

test('default state has exactly one workspace and the launched terminal lives in it', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const s = await getStore(window);
    const wsCount = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    expect(wsCount).toBe(1);
    const activeId = s.activeWorkspaceId as string;
    expect(activeId).toBeTruthy();
    // Every terminal carries the active workspace id (or undefined for
    // pre-workspace migrations).
    const tids = await window.evaluate(() => [...(window as any).__terminalStore.getState().terminals.entries()].map(([id, t]: [string, any]) => ({ id, workspaceId: t.workspaceId })));
    expect(tids.length).toBeGreaterThan(0);
    for (const t of tids) {
      expect(t.workspaceId === undefined || t.workspaceId === activeId).toBe(true);
    }
  } finally {
    await close();
  }
});

test('createWorkspace adds a workspace and switches to it', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const before = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    const newId = await createWorkspace(window);
    const s = await getStore(window);
    const after = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    expect(after).toBe(before + 1);
    expect(s.activeWorkspaceId).toBe(newId);
    // The newly created workspace starts with an empty layout.
    const layout = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return { tilingRoot: s.layout.tilingRoot, floating: s.layout.floatingPanels.length };
    });
    expect(layout.tilingRoot).toBeNull();
    expect(layout.floating).toBe(0);
  } finally {
    await close();
  }
});

test('terminals created in a workspace stay in that workspace when switching', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Note initial workspace + terminal id.
    const wsA = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);
    const termA = await window.evaluate(() => (window as any).__terminalStore.getState().focusedTerminalId);

    // New workspace + new terminal in it.
    const wsB = await createWorkspace(window);
    await window.evaluate(() => (window as any).__terminalStore.getState().createTerminal());
    await window.waitForTimeout(400);
    const termB = await window.evaluate(() => (window as any).__terminalStore.getState().focusedTerminalId);
    expect(termB).not.toBe(termA);

    // Each terminal carries its workspace id.
    const link = await window.evaluate(({ a, b }) => {
      const ts = (window as any).__terminalStore.getState().terminals;
      return { a: ts.get(a)?.workspaceId, b: ts.get(b)?.workspaceId };
    }, { a: termA, b: termB });
    expect(link.a).toBe(wsA);
    expect(link.b).toBe(wsB);

    // Switch back to workspace A: the active layout has termA, NOT termB.
    await window.evaluate((id) => (window as any).__terminalStore.getState().setActiveWorkspace(id), wsA);
    await window.waitForTimeout(300);
    const ids = await window.evaluate(() => {
      function leaves(node: any): string[] {
        if (!node) return [];
        if (node.kind === 'leaf') return [node.terminalId];
        return [...leaves(node.first), ...leaves(node.second)];
      }
      return leaves((window as any).__terminalStore.getState().layout.tilingRoot);
    });
    expect(ids).toContain(termA);
    expect(ids).not.toContain(termB);

    // Switch back to B: layout has termB, not termA.
    await window.evaluate((id) => (window as any).__terminalStore.getState().setActiveWorkspace(id), wsB);
    await window.waitForTimeout(300);
    const ids2 = await window.evaluate(() => {
      function leaves(node: any): string[] {
        if (!node) return [];
        if (node.kind === 'leaf') return [node.terminalId];
        return [...leaves(node.first), ...leaves(node.second)];
      }
      return leaves((window as any).__terminalStore.getState().layout.tilingRoot);
    });
    expect(ids2).toContain(termB);
    expect(ids2).not.toContain(termA);
  } finally {
    await close();
  }
});

test('closeWorkspace removes its terminals and switches to a successor', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const wsA = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);
    const termA = await window.evaluate(() => (window as any).__terminalStore.getState().focusedTerminalId);
    const wsB = await createWorkspace(window);
    await window.evaluate(() => (window as any).__terminalStore.getState().createTerminal());
    await window.waitForTimeout(400);
    const termB = await window.evaluate(() => (window as any).__terminalStore.getState().focusedTerminalId);

    // Close B - active should fall back to A; termB is gone from store.
    await window.evaluate((id) => (window as any).__terminalStore.getState().closeWorkspace(id), wsB);
    await window.waitForTimeout(400);
    const after = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return {
        active: s.activeWorkspaceId,
        wsCount: s.workspaces.size,
        hasTermA: s.terminals.has((window as any).__lastTermA),
        termCount: s.terminals.size,
      };
    });
    // Pre-write the captured term ids so the page evaluator can read them.
    await window.evaluate(({ a, b }) => {
      (window as any).__lastTermA = a;
      (window as any).__lastTermB = b;
    }, { a: termA, b: termB });
    const final = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return {
        active: s.activeWorkspaceId,
        wsCount: s.workspaces.size,
        hasTermA: s.terminals.has((window as any).__lastTermA),
        hasTermB: s.terminals.has((window as any).__lastTermB),
      };
    });
    expect(final.active).toBe(wsA);
    expect(final.wsCount).toBe(1);
    expect(final.hasTermA).toBe(true);
    expect(final.hasTermB).toBe(false);
  } finally {
    await close();
  }
});

test('closing the last workspace creates a fresh default rather than leaving zero', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const wsA = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);
    // Force-close the only workspace via the store action (UI guards
    // against this with size>1 checks, but the store itself must be
    // robust if anyone bypasses the UI).
    await window.evaluate((id) => (window as any).__terminalStore.getState().closeWorkspace(id), wsA);
    await window.waitForTimeout(300);
    const wsCount = await window.evaluate(() => (window as any).__terminalStore.getState().workspaces.size);
    expect(wsCount).toBeGreaterThanOrEqual(1);
  } finally {
    await close();
  }
});

test('tabMode=workspaces renders the workspace tab bar; flat renders the regular tab bar', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    // Default flat mode: tab-bar present, workspace-tab-bar absent.
    let bars = await window.evaluate(() => ({
      flat: !!document.querySelector('.tab-bar'),
      workspaces: !!document.querySelector('.workspace-tab-bar'),
    }));
    expect(bars.flat).toBe(true);
    expect(bars.workspaces).toBe(false);

    // Flip to workspaces mode via updateConfig (mirrors the command palette).
    await window.evaluate(() => (window as any).__terminalStore.getState().updateConfig({ tabMode: 'workspaces' }));
    await window.waitForTimeout(300);
    bars = await window.evaluate(() => ({
      flat: !!document.querySelector('.tab-bar'),
      workspaces: !!document.querySelector('.workspace-tab-bar'),
    }));
    expect(bars.workspaces).toBe(true);
    expect(bars.flat).toBe(false);
  } finally {
    await close();
  }
});

test('renameWorkspace updates the workspace name', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);
    const wsA = await window.evaluate(() => (window as any).__terminalStore.getState().activeWorkspaceId);
    await window.evaluate((id) => (window as any).__terminalStore.getState().renameWorkspace(id, 'Project A'), wsA);
    const name = await window.evaluate((id) => (window as any).__terminalStore.getState().workspaces.get(id).name, wsA);
    expect(name).toBe('Project A');
  } finally {
    await close();
  }
});

test('migrates a legacy flat session.json (no workspaces array) into a single default workspace', async () => {
  // Pre-seed userDataDir with a legacy tmax-session.json that has only
  // tree+floating (the pre-TASK-40 shape). Expect tmax to wrap it into
  // exactly one workspace, with all restored terminals belonging to it.
  const { window, close } = await launchTmax({
    preSeed: (userDataDir) => {
      const legacySession = {
        session: {
          tree: {
            kind: 'leaf',
            terminalId: 'legacy-1',
            terminal: {
              title: 'legacy shell',
              shellProfileId: '',
              cwd: process.cwd(),
            },
          },
          floating: [],
          // Intentionally NO workspaces array, NO activeWorkspaceId.
        },
      };
      writeFileSync(
        join(userDataDir, 'tmax-session.json'),
        JSON.stringify(legacySession, null, 2),
        'utf-8',
      );
    },
  });
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);
    const summary = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return {
        wsCount: s.workspaces.size,
        activeId: s.activeWorkspaceId,
        wsIds: [...s.workspaces.keys()],
        terminalCount: s.terminals.size,
        terminalWorkspaceIds: [...s.terminals.values()].map((t: any) => t.workspaceId),
      };
    });
    expect(summary.wsCount).toBe(1);
    expect(summary.terminalCount).toBeGreaterThan(0);
    expect(summary.activeId).toBeTruthy();
    expect(summary.wsIds).toContain(summary.activeId);
    // Every restored terminal carries the active workspace id (the
    // migration target) — not undefined and not some other id.
    for (const wid of summary.terminalWorkspaceIds) {
      expect(wid).toBe(summary.activeId);
    }
  } finally {
    await close();
  }
});
