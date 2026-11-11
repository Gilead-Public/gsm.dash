// @ts-check
import { defineConfig } from '@playwright/test';
import { join, resolve } from 'node:path';

const runDir = resolve(process.env.VALIDATION_RUN_DIR ?? 'validation-runs/dev');
const port = Number(process.env.VALIDATION_PORT ?? 4410);
export const PREFIX = '/cod-demo/';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  outputDir: join(runDir, 'playwright-artifacts'),
  timeout: 20_000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  use: { trace: 'on' },
  projects: [
    { name: 'file' },
    { name: 'subpath', use: { baseURL: `http://127.0.0.1:${port}${PREFIX}` } },
],
  webServer: {
    command: `node validation/serve.js ${join(runDir, 'build/subpath')} ${port} --prefix ${PREFIX}`,
    url: `http://127.0.0.1:${port}${PREFIX}`,
    reuseExistingServer: false,
  },
});
