import { _electron, ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  close: () => Promise<void>;
}

export async function launchTmax(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'tmax-e2e-'));
  const outDir = process.env.TMAX_E2E_OUT_DIR || 'out-e2e';
  const exePath = join(process.cwd(), outDir, 'tmax-win32-x64', 'tmax.exe');
  if (!existsSync(exePath)) {
    throw new Error(
      `Packaged tmax not found at ${exePath}. Run \`npm run package\` first.`,
    );
  }
  const app = await _electron.launch({
    executablePath: exePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, TMAX_E2E: '1' },
    timeout: 30_000,
  });
  const window = await app.firstWindow();
  await window.waitForFunction(() => !!(window as any).__terminalStore, null, {
    timeout: 15_000,
  });
  return {
    app,
    window,
    userDataDir,
    close: async () => {
      try { await app.close(); } catch { /* already closed */ }
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

export async function getStoreState(window: Page): Promise<any> {
  return window.evaluate(() => {
    const store = (window as any).__terminalStore;
    if (!store) return null;
    const s = store.getState();
    return {
      focused: s.focusedTerminalId,
      viewMode: s.viewMode,
      preGridRoot: s.preGridRoot,
      terminalIds: [...s.terminals.keys()],
      tilingRoot: s.layout?.tilingRoot,
    };
  });
}
