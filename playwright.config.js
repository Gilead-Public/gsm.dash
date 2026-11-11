// @ts-check
import { defineConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectName, requireRunDir, SPEC_ARTIFACTS, targetedProjects } from './e2e/projects.js';

const runDir = resolve(requireRunDir());
const port = Number(process.env.VALIDATION_PORT ?? 4410);
export const PREFIX = '/cod-demo/';

// A spec missing from SPEC_ARTIFACTS would belong to no project and silently never run.
const undeclared = readdirSync('e2e').filter((f) => f.endsWith('.spec.js') && !SPEC_ARTIFACTS[`e2e/${f}`]);
if (undeclared.length) throw new Error(`declare the artifacts for ${undeclared.join(', ')} in e2e/projects.js`);

/**
 * @param {string} artifact
 */
const specsFor = (artifact) =>
  Object.entries(SPEC_ARTIFACTS)
    .filter(([, artifacts]) => artifacts.some((a) => a === artifact))
    .map(([file]) => new RegExp(`${file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`));

export default defineConfig({
  testDir: 'e2e',
  outputDir: join(runDir, 'playwright-artifacts'),
  timeout: 20_000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  use: { trace: 'on' },
  projects: targetedProjects().map(({ artifact, mode }) => ({
    name: projectName(artifact, mode),
    testMatch: specsFor(artifact),
    ...(mode === 'subpath' ? { use: { baseURL: `http://127.0.0.1:${port}${PREFIX}` } } : {}),
  })),
  webServer: {
    command: `node validation/serve.js ${join(runDir, 'build/subpath')} ${port} --prefix ${PREFIX}`,
    url: `http://127.0.0.1:${port}${PREFIX}`,
    reuseExistingServer: false,
  },
});
