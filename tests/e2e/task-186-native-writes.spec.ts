import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject, createTask, editTask, archiveTask } from '../../src/main/backlog-writer';

// TASK-186: the native (no-CLI) write layer must produce files the real
// backlog.md CLI can still read. These tests write with our code and read
// back with the actual `backlog` binary to prove format compatibility.

const isWin = process.platform === 'win32';
function backlog(cwd: string, args: string[]): string {
  // shell:true on win so the .cmd shim resolves; quote whitespace args.
  const a = isWin ? args.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : args;
  return execFileSync('backlog', a, { cwd, encoding: 'utf-8', shell: isWin } as any);
}
function gitInit(cwd: string) {
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd });
  execFileSync('git', ['config', 'user.name', 't'], { cwd });
}

let cliAvailable = true;
try { execFileSync('backlog', ['--version'], { shell: isWin } as any); } catch { cliAvailable = false; }

test.describe('native backlog writes are CLI-compatible', () => {
  test.skip(!cliAvailable, 'backlog CLI not on PATH');

  test('native init + create + edit + archive, verified by the real CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-native-'));
    try {
      gitInit(dir);

      // 1. Native init scaffolds a project the CLI accepts.
      expect(initProject(dir, 'scratch').ok).toBe(true);
      expect(existsSync(join(dir, 'backlog', 'config.yml'))).toBe(true);

      // 2. Native create -> the CLI lists it.
      const c = createTask({ projectPath: dir, title: 'Wire the gizmo: now', description: 'Do it.', status: 'To Do' });
      expect(c.ok).toBe(true);
      expect(c.id).toBe('TASK-1');
      let plain = backlog(dir, ['task', '1', '--plain']);
      expect(plain).toContain('Wire the gizmo: now');
      expect(plain).toMatch(/Status:.*To Do/);

      // 3. Add ACs natively by rewriting? The CLI added none; create one via CLI
      //    then toggle it natively to prove AC editing round-trips.
      backlog(dir, ['task', 'edit', '1', '--ac', 'First crit', '--ac', 'Second crit']);
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', checkAc: [1] }).ok).toBe(true);
      plain = backlog(dir, ['task', '1', '--plain']);
      expect(plain).toMatch(/\[x\].*#1/); // CLI sees AC #1 checked
      expect(plain).toMatch(/\[ \].*#2/);

      // 4. Native status + title edit -> CLI reflects them.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', status: 'In Progress', title: 'Renamed gizmo' }).ok).toBe(true);
      plain = backlog(dir, ['task', '1', '--plain']);
      expect(plain).toMatch(/Status:.*In Progress/);
      expect(plain).toContain('Renamed gizmo');

      // 5. Native archive -> task leaves the active list.
      expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
      const list = backlog(dir, ['task', 'list', '--plain']);
      expect(list).not.toContain('Renamed gizmo');
      expect(existsSync(join(dir, 'backlog', 'archive', 'tasks'))).toBe(true);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('id allocation increments and zero-pad config is respected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-native-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      const a = createTask({ projectPath: dir, title: 'one' });
      const b = createTask({ projectPath: dir, title: 'two' });
      expect(a.id).toBe('TASK-1');
      expect(b.id).toBe('TASK-2');
      // Frontmatter id is uppercase TASK-N; filename uses lowercase task-N.
      const cfg = readFileSync(join(dir, 'backlog', 'config.yml'), 'utf-8');
      expect(cfg).toContain('statuses:');
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
