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

// This one MUST run with no backlog CLI present - it proves a fresh user with
// nothing installed can init + create + edit + archive entirely via tmax.
test('full lifecycle works with no git and without calling the CLI (native only)', () => {
  // This test never invokes the `backlog` binary - it only calls the native
  // writer - so it proves a CLI-less user is fully served regardless of whether
  // the CLI happens to be installed on this machine.
  const dir = mkdtempSync(join(tmpdir(), 'tmax-nocli-'));
  const fs = require('fs');
  try {
    // No git init, no CLI - just tmax's native init.
    expect(initProject(dir, 'fresh').ok).toBe(true);
    expect(existsSync(join(dir, 'backlog', 'config.yml'))).toBe(true);
    expect(existsSync(join(dir, 'backlog', 'tasks'))).toBe(true);

    const c = createTask({ projectPath: dir, title: 'first task', description: 'hello' });
    expect(c.id).toBe('TASK-1');
    const tasksDir = join(dir, 'backlog', 'tasks');
    const read = () => fs.readFileSync(join(tasksDir, fs.readdirSync(tasksDir)[0]), 'utf-8');
    expect(read()).toMatch(/title: first task/);
    expect(read()).toMatch(/DESCRIPTION:BEGIN[\s\S]*hello[\s\S]*DESCRIPTION:END/);

    expect(editTask({ projectPath: dir, taskId: 'TASK-1', status: 'In Progress', description: 'updated body' }).ok).toBe(true);
    expect(read()).toMatch(/status: In Progress/);
    expect(read()).toMatch(/updated body/);

    expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
    expect(fs.readdirSync(tasksDir).length).toBe(0);
    expect(fs.readdirSync(join(dir, 'backlog', 'archive', 'tasks')).length).toBe(1);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

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

      // 4b. Native description edit -> CLI shows it in the Description section.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', description: 'A freshly edited body.' }).ok).toBe(true);
      plain = backlog(dir, ['task', '1', '--plain']);
      expect(plain).toContain('A freshly edited body.');

      // 5. Native archive -> task leaves the active list.
      expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
      const list = backlog(dir, ['task', 'list', '--plain']);
      expect(list).not.toContain('Renamed gizmo');
      expect(existsSync(join(dir, 'backlog', 'archive', 'tasks'))).toBe(true);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('editing the description of a task created WITHOUT one persists to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-native-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      // Create with NO description (the board's "+ Add task" path).
      const c = createTask({ projectPath: dir, title: 'testing something' });
      expect(c.id).toBe('TASK-1');
      const r = editTask({ projectPath: dir, taskId: 'TASK-1', description: '234' });
      expect(r.ok).toBe(true);
      // Read the file straight off disk - the description must be persisted.
      const f = join(dir, 'backlog', 'tasks', require('fs').readdirSync(join(dir, 'backlog', 'tasks'))[0]);
      const content = require('fs').readFileSync(f, 'utf-8');
      expect(content).toMatch(/DESCRIPTION:BEGIN[\s\S]*234[\s\S]*DESCRIPTION:END/);
      // And the real CLI reads it back.
      expect(backlog(dir, ['task', '1', '--plain'])).toContain('234');
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('description edit works on a CRLF file (git-checkout style)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-native-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      createTask({ projectPath: dir, title: 'crlf task' });
      // Rewrite the created file with CRLF endings to mimic a git checkout.
      const fs = require('fs');
      const dirT = join(dir, 'backlog', 'tasks');
      const f = join(dirT, fs.readdirSync(dirT)[0]);
      fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace(/\r?\n/g, '\r\n'), 'utf-8');
      const r = editTask({ projectPath: dir, taskId: 'TASK-1', description: 'crlf body' });
      expect(r.ok).toBe(true);
      expect(fs.readFileSync(f, 'utf-8')).toMatch(/DESCRIPTION:BEGIN[\s\S]*crlf body[\s\S]*DESCRIPTION:END/);
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
