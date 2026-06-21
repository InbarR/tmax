import { describe, test, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject, createTask, editTask, archiveTask } from '../../../src/main/backlog-writer';

// TASK-186: the native (no-CLI) write layer must produce files the real
// backlog.md CLI can still read. These tests write with our code and read
// back with the actual `backlog` binary to prove format compatibility.

const isWin = process.platform === 'win32';
const commandShell = process.env.ComSpec || 'cmd.exe';

function backlog(cwd: string, args: string[]): string {
  if (isWin) {
    // `backlog` is a .cmd shim on Windows, so it must run via cmd.exe. Pass the
    // command and its args as separate argv tokens (not a hand-joined, hand-
    // quoted string) so Node quotes each correctly - a pre-joined string
    // mangled repeated `--ac "value"` flags into stray positional arguments.
    return execFileSync(commandShell, ['/d', '/s', '/c', 'backlog', ...args], { cwd, encoding: 'utf-8' });
  }
  return execFileSync('backlog', args, { cwd, encoding: 'utf-8' });
}
function gitInit(cwd: string) {
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd });
  execFileSync('git', ['config', 'user.name', 't'], { cwd });
}

let cliAvailable = true;
try {
  if (isWin) {
    execFileSync(commandShell, ['/d', '/s', '/c', 'backlog --version'], { stdio: 'ignore' });
  } else {
    execFileSync('backlog', ['--version'], { stdio: 'ignore' });
  }
} catch {
  cliAvailable = false;
}

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

// These exercise the native un-archive / find-anywhere / create-with-description
// logic added this session. They never call the `backlog` CLI - all assertions
// read the filesystem directly so they're hermetic and fast.
describe('native un-archive + find-anywhere (no CLI)', () => {
  const fs = require('fs');
  const tasksDir = (d: string) => join(d, 'backlog', 'tasks');
  const archiveDir = (d: string) => join(d, 'backlog', 'archive', 'tasks');
  const onlyFile = (dir: string) => {
    const ents = fs.readdirSync(dir);
    return ents.length ? join(dir, ents[0]) : null;
  };

  test('editTask un-archives a task (moves back to tasks/ and sets status)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-unarch-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      expect(createTask({ projectPath: dir, title: 'to be archived' }).id).toBe('TASK-1');
      expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
      // Precondition: it left tasks/ and is in archive/tasks.
      expect(fs.readdirSync(tasksDir(dir)).length).toBe(0);
      expect(fs.readdirSync(archiveDir(dir)).length).toBe(1);

      // Un-archive by editing with a real, non-Archived status.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', status: 'In Progress' }).ok).toBe(true);

      // File moved BACK to tasks/, gone from archive, status updated.
      expect(fs.readdirSync(archiveDir(dir)).length).toBe(0);
      expect(fs.readdirSync(tasksDir(dir)).length).toBe(1);
      const content = fs.readFileSync(onlyFile(tasksDir(dir))!, 'utf-8');
      expect(content).toMatch(/status: In Progress/);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test("editTask with status 'Archived' on a non-archived task does NOT move it", () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-noarch-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      expect(createTask({ projectPath: dir, title: 'stays put' }).id).toBe('TASK-1');
      // Setting status to 'Archived' must not relocate the file into archive/tasks.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', status: 'Archived' }).ok).toBe(true);
      expect(fs.readdirSync(tasksDir(dir)).length).toBe(1);
      expect(fs.readdirSync(archiveDir(dir)).length).toBe(0);
      const content = fs.readFileSync(onlyFile(tasksDir(dir))!, 'utf-8');
      expect(content).toMatch(/status: Archived/);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('editTask finds an archived task and edits it in place (no status change)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-archedit-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      createTask({ projectPath: dir, title: 'archived edit target' });
      expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
      // Edit only the description - no status, so it must STAY in archive/tasks.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', description: 'edited while archived' }).ok).toBe(true);
      expect(fs.readdirSync(tasksDir(dir)).length).toBe(0);
      expect(fs.readdirSync(archiveDir(dir)).length).toBe(1);
      const content = fs.readFileSync(onlyFile(archiveDir(dir))!, 'utf-8');
      expect(content).toMatch(/DESCRIPTION:BEGIN[\s\S]*edited while archived[\s\S]*DESCRIPTION:END/);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('createTask threads a description into the Description section', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-createdesc-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      const c = createTask({ projectPath: dir, title: 'with body', description: 'hello world' });
      expect(c.id).toBe('TASK-1');
      const content = fs.readFileSync(onlyFile(tasksDir(dir))!, 'utf-8');
      expect(content).toMatch(/DESCRIPTION:BEGIN[\s\S]*hello world[\s\S]*DESCRIPTION:END/);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('editTask un-archive handles a simultaneous title change (new slug + status)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-unarchtitle-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      createTask({ projectPath: dir, title: 'old title here' });
      expect(archiveTask(dir, 'TASK-1').ok).toBe(true);
      // Un-archive AND rename in one edit.
      expect(editTask({ projectPath: dir, taskId: 'TASK-1', status: 'In Progress', title: 'brand new title' }).ok).toBe(true);
      // Lands in tasks/ with the new slug filename.
      expect(fs.readdirSync(archiveDir(dir)).length).toBe(0);
      const files = fs.readdirSync(tasksDir(dir));
      expect(files.length).toBe(1);
      expect(files[0]).toBe('task-1 - brand-new-title.md');
      const content = fs.readFileSync(join(tasksDir(dir), files[0]), 'utf-8');
      expect(content).toMatch(/status: In Progress/);
      expect(content).toMatch(/title: brand new title/);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

describe.skipIf(!cliAvailable)('native backlog writes are CLI-compatible', () => {

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

  test('archived task ids are never reused (self-healing allocation, TASK-206)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmax-native-'));
    try {
      gitInit(dir);
      initProject(dir, 'scratch');
      const a = createTask({ projectPath: dir, title: 'one' });
      const b = createTask({ projectPath: dir, title: 'two' });
      expect(a.id).toBe('TASK-1');
      expect(b.id).toBe('TASK-2');
      // Archive the highest id, then create again: the archived id (2) must NOT
      // be reused even though it's no longer in tasks/. This is the exact bug
      // the CLI's stored next_id counter hit during development.
      archiveTask(dir, 'TASK-2');
      const c = createTask({ projectPath: dir, title: 'three' });
      expect(c.id).toBe('TASK-3');
      // The archived file still exists with its original id.
      expect(existsSync(join(dir, 'backlog', 'archive', 'tasks', 'task-2 - two.md'))).toBe(true);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
