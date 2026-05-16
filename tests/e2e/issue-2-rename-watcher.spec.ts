import { test, expect } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Issue #2 follow-up — Bug 1 (watcher routing workspace.yaml) and Bug 2 (monitor
// diff comparing the right field) live in the main-process file-watching layer.
// The original commit b86b24f tried to cover them with a single line each, but
// shipped with the wrong field name in the diff (compared `summary`, but
// `/rename` writes `name`) and with no parser case for `name`/`user_named` —
// so the on-disk rename was silently dropped.
//
// These tests exercise the FULL chain end-to-end against the live watcher
// running in the packaged tmax: write/modify a real workspace.yaml on disk,
// wait for chokidar to fire, and verify the renderer's session list reflects
// the change. They would have caught the original incomplete fix.
//
// We write into the user's REAL ~/.copilot/session-state dir with a clearly-
// tagged fixture GUID (test-issue-2-...) and clean up in test teardown so
// the user's normal sessions are untouched. Each test uses a fresh GUID
// derived from Math.random() to keep parallel runs safe.

const TEST_GUID_PREFIX = 'test-issue-2-fix';
const SESSION_BASE = join(homedir(), '.copilot', 'session-state');

function makeTestSession(): { guid: string; dir: string; cleanup: () => void } {
  const guid = `${TEST_GUID_PREFIX}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = join(SESSION_BASE, guid);
  mkdirSync(dir, { recursive: true });
  return {
    guid,
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

function writeWorkspaceYaml(dir: string, fields: Record<string, string | boolean>): void {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  writeFileSync(join(dir, 'workspace.yaml'), lines.join('\n') + '\n');
}

function writeEventsJsonl(dir: string): void {
  // Minimal events.jsonl with one user.message so messageCount > 0 (which the
  // CopilotPanel sidebar filter requires to render the session at all). The
  // exact event shape comes from looking at copilot-events-parser.ts and the
  // real session files on disk.
  const event = {
    type: 'user.message',
    timestamp: new Date().toISOString(),
    user_content: 'fixture session for issue-2 tests',
  };
  writeFileSync(join(dir, 'events.jsonl'), JSON.stringify(event) + '\n');
}

test('Bug 1+2 — /rename via workspace.yaml propagates to renderer (the original fix path)', async () => {
  const fixture = makeTestSession();
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });

    // Wait for the initial async session scan to settle — the watcher's
    // chokidar instance only fires 'add' for files created AFTER it
    // reaches 'ready', and the renderer-visible signal that loadCopilotSessions
    // has completed is copilotSqliteActive flipping true (or copilotSessions
    // becoming non-empty for users with existing sessions on disk). Waiting
    // for stability here avoids racing the watcher startup.
    await window.waitForFunction(() => {
      const s = (window as any).__terminalStore.getState();
      return s.copilotSqliteActive === true || s.copilotSessions.length > 0;
    }, null, { timeout: 15_000 });
    // Extra grace — chokidar 'ready' fires up to ~1s after first scan completes.
    await window.waitForTimeout(2_000);

    // Step 1: seed initial workspace.yaml + events.jsonl on disk. The watcher
    // is now fully ready, so this should fire 'add' events into the monitor.
    writeWorkspaceYaml(fixture.dir, {
      cwd: 'C:/projects/issue-2-fixture',
      branch: 'main',
      repository: 'fixture',
      summary: 'BEFORE-RENAME',
      user_named: false,
    });
    writeEventsJsonl(fixture.dir);

    // Wait for the renderer to see our session.
    await expect.poll(
      async () => window.evaluate((guid) => {
        const s = (window as any).__terminalStore.getState();
        const ours = s.copilotSessions.find((x: any) => x.id === guid);
        return ours?.summary ?? null;
      }, fixture.guid),
      { timeout: 15_000, intervals: [200, 500, 1000] },
    ).toBe('BEFORE-RENAME');

    // Step 2: simulate `/rename AFTER-RENAME` — the CLI rewrites the yaml
    // with a new `name:` field and flips `user_named: true`. Note: it does
    // NOT touch `summary:`. This was the exact field the original fix
    // forgot about.
    writeWorkspaceYaml(fixture.dir, {
      cwd: 'C:/projects/issue-2-fixture',
      branch: 'main',
      repository: 'fixture',
      summary: 'BEFORE-RENAME', // intentionally unchanged
      name: 'AFTER-RENAME',
      user_named: true,
    });

    // Wait for the change to round-trip through:
    //   1. chokidar 'change' event on workspace.yaml
    //   2. CopilotSessionWatcher.onEventsChanged routes it (Bug 1 fix)
    //   3. CopilotSessionMonitor.refreshSession diff detects name/userNamed
    //      change and fires onSessionUpdated (Bug 2 fix + this commit's diff
    //      additions)
    //   4. IPC push to renderer; store's updateCopilotSession replaces the
    //      session in copilotSessions
    //   5. CopilotPanel useMemo recomputes display name
    //
    // The post-fix parser sets workspace.summary = name when user_named=true,
    // so the renderer's session.summary should change to "AFTER-RENAME".
    await expect.poll(
      async () => window.evaluate((guid) => {
        const s = (window as any).__terminalStore.getState();
        const ours = s.copilotSessions.find((x: any) => x.id === guid);
        return ours?.summary ?? null;
      }, fixture.guid),
      { timeout: 15_000, intervals: [200, 500, 1000] },
    ).toContain('AFTER-RENAME');
  } finally {
    fixture.cleanup();
    await close();
  }
});

test('Bug 1+2 — workspace.yaml without user_named keeps deriving name from summary (no regression)', async () => {
  // Sanity: a workspace.yaml change that does NOT have user_named=true must
  // continue to use the existing derive-from-summary path, not the new
  // user-named override branch. This guards the parser's existing behaviour
  // for sessions where `/rename` was never used.
  const fixture = makeTestSession();
  const { window, close } = await launchTmax();
  try {
    await window.waitForFunction(() => !!(window as any).__terminalStore, null, { timeout: 15_000 });
    await window.waitForFunction(() => {
      const s = (window as any).__terminalStore.getState();
      return s.copilotSqliteActive === true || s.copilotSessions.length > 0;
    }, null, { timeout: 15_000 });
    await window.waitForTimeout(2_000);

    writeWorkspaceYaml(fixture.dir, {
      cwd: 'C:/projects/issue-2-fixture-no-rename',
      branch: 'main',
      repository: 'fixture',
      summary: 'normal-summary',
      name: 'this-name-should-be-ignored',
      user_named: false,
    });
    writeEventsJsonl(fixture.dir);

    // Single poll for both presence and the expected summary value.
    // Splitting waitForFunction(presence) + window.evaluate(read) is racy:
    // autoArchiveStaleSessions periodically prunes sessions and may remove
    // our short-lived fixture between the two awaits.
    await expect.poll(
      async () => window.evaluate((guid) => {
        const s = (window as any).__terminalStore.getState();
        const ours = s.copilotSessions.find((x: any) => x.id === guid);
        return ours?.summary ?? null;
      }, fixture.guid),
      { timeout: 15_000, intervals: [200, 500, 1000] },
    ).toBe('normal-summary');
  } finally {
    fixture.cleanup();
    await close();
  }
});
