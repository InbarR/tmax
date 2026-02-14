import { IPty, spawn } from 'node-pty';

export interface PtyCreateOpts {
  id: string;
  shellPath: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
}

export interface PtyCallbacks {
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number | undefined) => void;
}

export class PtyManager {
  private ptys = new Map<string, IPty>();
  private callbacks: PtyCallbacks;

  constructor(callbacks: PtyCallbacks) {
    this.callbacks = callbacks;
  }

  create(opts: PtyCreateOpts): { id: string; pid: number } {
    const ptyProcess = spawn(opts.shellPath, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env ?? (process.env as Record<string, string>),
    });

    this.ptys.set(opts.id, ptyProcess);

    ptyProcess.onData((data) => {
      this.callbacks.onData(opts.id, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.ptys.delete(opts.id);
      this.callbacks.onExit(opts.id, exitCode);
    });

    return { id: opts.id, pid: ptyProcess.pid };
  }

  write(id: string, data: string): void {
    const pty = this.ptys.get(id);
    if (pty) {
      pty.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const pty = this.ptys.get(id);
    if (pty) {
      pty.resize(cols, rows);
    }
  }

  kill(id: string): void {
    const pty = this.ptys.get(id);
    if (pty) {
      pty.kill();
      this.ptys.delete(id);
    }
  }

  killAll(): void {
    for (const [id, pty] of this.ptys) {
      pty.kill();
      this.ptys.delete(id);
    }
  }
}
