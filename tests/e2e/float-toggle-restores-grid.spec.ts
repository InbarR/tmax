import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

// Regression for the bug where Ctrl+Shift+U twice (toggleFloat -> back to
// tiled) flattens a 2x2 grid into a 1x4 row of columns. The cause was that
// moveToFloat dropped the leaf without remembering its parent split's
// direction/ratio/position, and moveToTiling without an explicit target
// always re-inserted via the tab-neighbour heuristic, which uses
// horizontal splits. moveToFloat now snapshots the position; moveToTiling
// uses the snapshot to put the leaf back where it was.

interface TreeNode {
  kind: 'split' | 'leaf';
  direction?: 'horizontal' | 'vertical';
  splitRatio?: number;
  terminalId?: string;
  first?: TreeNode;
  second?: TreeNode;
}

function structuralShape(node: TreeNode | null | undefined): unknown {
  if (!node) return null;
  if (node.kind === 'leaf') return { kind: 'leaf' };
  return {
    kind: 'split',
    direction: node.direction,
    first: structuralShape(node.first),
    second: structuralShape(node.second),
  };
}

test('Ctrl+Shift+U round trip preserves a 2x2 grid (bottom-right pane)', async () => {
  test.setTimeout(120_000);
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    // Build a 2x2 grid from a single starter pane, doing each split in its
    // own evaluate so the previous PTY/state has fully settled before the
    // next call. Final tree:
    //   H split
    //   ├── V split (left col)
    //   │   ├── t0
    //   │   └── t3
    //   └── V split (right col)
    //       ├── t1
    //       └── t2
    const t0 = await window.evaluate(() => {
      const s = (window as any).__terminalStore.getState();
      return s.focusedTerminalId ?? Array.from(s.terminals.keys())[0];
    });
    const t1 = await window.evaluate(async (id) => {
      await (window as any).__terminalStore.getState().splitTerminal(id, 'horizontal', undefined, 'right');
      return (window as any).__terminalStore.getState().focusedTerminalId;
    }, t0);
    await window.waitForTimeout(500);
    const t2 = await window.evaluate(async (id) => {
      await (window as any).__terminalStore.getState().splitTerminal(id, 'vertical', undefined, 'bottom');
      return (window as any).__terminalStore.getState().focusedTerminalId;
    }, t1);
    await window.waitForTimeout(500);
    const t3 = await window.evaluate(async (id) => {
      await (window as any).__terminalStore.getState().splitTerminal(id, 'vertical', undefined, 'bottom');
      return (window as any).__terminalStore.getState().focusedTerminalId;
    }, t0);
    await window.waitForTimeout(500);
    expect([t0, t1, t2, t3].every(Boolean)).toBe(true);
    expect(t0).toBeTruthy();
    expect(t1).toBeTruthy();
    expect(t2).toBeTruthy();

    const treeBefore = await window.evaluate(() => {
      return (window as any).__terminalStore.getState().layout.tilingRoot;
    });
    const shapeBefore = structuralShape(treeBefore);
    // Sanity: 2x2 grid is two horizontal-split halves, each split vertically.
    expect(shapeBefore).toEqual({
      kind: 'split',
      direction: 'horizontal',
      first: {
        kind: 'split',
        direction: 'vertical',
        first: { kind: 'leaf' },
        second: { kind: 'leaf' },
      },
      second: {
        kind: 'split',
        direction: 'vertical',
        first: { kind: 'leaf' },
        second: { kind: 'leaf' },
      },
    });

    // Float t2 (bottom-right pane).
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToFloat(id);
    }, t2);
    await window.waitForTimeout(300);

    const floatedState = await window.evaluate((id) => {
      const s = (window as any).__terminalStore.getState();
      return {
        mode: s.terminals.get(id)?.mode,
        anchor: s.layout.floatingPanels.find((p: any) => p.terminalId === id)?.preFloatAnchor,
      };
    }, t2);
    expect(floatedState.mode).toBe('floating');
    expect(floatedState.anchor).toBeTruthy();
    expect(floatedState.anchor.parentDirection).toBe('vertical');
    expect(floatedState.anchor.position).toBe('second');

    // Toggle back to tiled with no explicit target (simulates Ctrl+Shift+U).
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToTiling(id);
    }, t2);
    await window.waitForTimeout(300);

    const treeAfter = await window.evaluate(() => {
      return (window as any).__terminalStore.getState().layout.tilingRoot;
    });
    const shapeAfter = structuralShape(treeAfter);
    expect(shapeAfter).toEqual(shapeBefore);
  } finally {
    await close();
  }
});

test('Ctrl+Shift+U round trip preserves a vertical (top/bottom) split', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const ids = await window.evaluate(async () => {
      const api = (window as any).__terminalStore.getState();
      const t0 = api.focusedTerminalId ?? Array.from(api.terminals.keys())[0];
      await api.splitTerminal(t0, 'vertical', undefined, 'bottom');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1];
    });
    await window.waitForTimeout(400);
    const [, t1] = ids;

    const treeBefore = await window.evaluate(() => {
      return (window as any).__terminalStore.getState().layout.tilingRoot;
    });
    const shapeBefore = structuralShape(treeBefore);
    expect(shapeBefore).toEqual({
      kind: 'split',
      direction: 'vertical',
      first: { kind: 'leaf' },
      second: { kind: 'leaf' },
    });

    // Float the bottom pane.
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToFloat(id);
    }, t1);
    await window.waitForTimeout(300);

    // After the float, only the top leaf remains in the tiling tree.
    const treeWhileFloated = await window.evaluate(() => {
      return (window as any).__terminalStore.getState().layout.tilingRoot;
    });
    expect(structuralShape(treeWhileFloated)).toEqual({ kind: 'leaf' });

    // Toggle back. Should restore as a vertical split with the bottom pane
    // at the bottom, NOT as a horizontal split (which is what the old
    // tab-neighbour fallback produced).
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToTiling(id);
    }, t1);
    await window.waitForTimeout(300);

    const treeAfter = await window.evaluate(() => {
      return (window as any).__terminalStore.getState().layout.tilingRoot;
    });
    expect(structuralShape(treeAfter)).toEqual(shapeBefore);
    // Be specific: direction must be vertical, not horizontal.
    expect((treeAfter as TreeNode).direction).toBe('vertical');
  } finally {
    await close();
  }
});

test('Ctrl+Shift+U round trip falls back gracefully when the original sibling is gone', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(800);

    const ids = await window.evaluate(async () => {
      const api = (window as any).__terminalStore.getState();
      const t0 = api.focusedTerminalId ?? Array.from(api.terminals.keys())[0];
      await api.splitTerminal(t0, 'horizontal', undefined, 'right');
      const t1 = (window as any).__terminalStore.getState().focusedTerminalId;
      return [t0, t1];
    });
    await window.waitForTimeout(400);
    const [t0, t1] = ids;

    // Float t1.
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToFloat(id);
    }, t1);
    await window.waitForTimeout(300);

    // Close the sibling (t0) while t1 is floating. tilingRoot becomes null.
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().closeTerminal(id);
    }, t0);
    await window.waitForTimeout(300);

    // Toggle t1 back. Should land as the new root, no crash.
    await window.evaluate((id) => {
      (window as any).__terminalStore.getState().moveToTiling(id);
    }, t1);
    await window.waitForTimeout(300);

    const after = await window.evaluate((id) => {
      const s = (window as any).__terminalStore.getState();
      return {
        mode: s.terminals.get(id)?.mode,
        rootKind: s.layout.tilingRoot?.kind,
        rootLeafId: s.layout.tilingRoot?.kind === 'leaf' ? s.layout.tilingRoot.terminalId : null,
      };
    }, t1);
    expect(after.mode).toBe('tiled');
    expect(after.rootKind).toBe('leaf');
    expect(after.rootLeafId).toBe(t1);
  } finally {
    await close();
  }
});
