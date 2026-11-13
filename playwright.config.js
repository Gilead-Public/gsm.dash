// @ts-check
import { defineConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectName, requireRunDir, SPEC_ARTIFACTS, targetedProjects } from './e2e/projects.js';

const runDir = resolve(requireRunDir());
const port = Number(process.env.VALIDATION_PORT ?? 4410);
/** Each artifact's sub-path build gets its own server, so both are hosted under the same prefix. */
const ports = { spa: port, reports: port + 1 };
const projects = targetedProjects();
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
  // One baseline per state, shared by both delivery modes and every platform: a mode or platform difference is a failure.
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  outputDir: join(runDir, 'playwright-artifacts'),
  timeout: 20_000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  use: { trace: 'on' },
  projects: projects.map(({ artifact, mode }) => ({
    name: projectName(artifact, mode),
    testMatch: specsFor(artifact),
    ...(mode === 'subpath' ? { use: { baseURL: `http://127.0.0.1:${ports[artifact]}${PREFIX}` } } : {}),
  })),
  webServer: [...new Set(projects.map((p) => p.artifact))].map((artifact) => ({
    command: `node validation/serve.js ${join(runDir, artifact === 'spa' ? 'build/subpath' : 'build/reports')} ${ports[artifact]} --prefix ${PREFIX}`,
    url: `http://127.0.0.1:${ports[artifact]}${PREFIX}${artifact === 'spa' ? '' : 'portfolio.html'}`,
    reuseExistingServer: false,
  })),
});
