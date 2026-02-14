export async function createPtyForTerminal(
  terminalId: string,
  profile: { path: string; args: string[]; env?: Record<string, string>; cwd?: string },
  cols: number,
  rows: number
): Promise<number> {
  const result = await window.terminalAPI.createPty({
    id: terminalId,
    shellPath: profile.path,
    args: profile.args,
    cwd: profile.cwd ?? 'C:\\',
    env: profile.env,
    cols,
    rows,
  });
  return result.pid;
}

export function killPtyForTerminal(terminalId: string): void {
  window.terminalAPI.killPty(terminalId);
}
