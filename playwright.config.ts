import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // Electron bring-up is flaky on cold CI runners (window init, PTY spawn
  // races). Retry once there; locally we want immediate failure signal.
  retries: isCI ? 2 : 0,
  // Always emit the HTML dashboard (open `npm run test:e2e:report` after a run,
  // or use `npm run test:e2e:ui` for a live dashboard). `list` gives streaming
  // per-test status in the terminal; `open: 'never'` keeps runs non-interactive.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },
});
