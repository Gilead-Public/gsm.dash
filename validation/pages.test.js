// @ts-check
// The Pages workflow publishes a release and nothing else: dispatched from main, it builds nothing, and it uploads only
// what validation/release.js staged after checking the run.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { VALIDATION_WORKFLOW } from './lib/package-check.js';

const ROOT = join(import.meta.dirname, '..');
/** @type {any} */
const workflow = parse(readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8'));
/** @type {any[]} */
const steps = workflow.jobs.release.steps;
const runs = steps.filter((s) => s.run).map((s) => String(s.run));
const at = (/** @type {(s: any) => boolean} */ test) => steps.findIndex(test);

describe('the Pages workflow', () => {
  it('runs only when dispatched with a release tag, and only from main', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(workflow.jobs.release.if).toBe("github.ref == 'refs/heads/main'");
  });

  it('builds, installs and generates nothing', () => {
    for (const command of runs) expect(command).not.toMatch(/npm (ci|install|run|test)|vite|astro|package-reports|generate-example-data|build-standalone/);
  });

  it('finds the tag commit’s validation run among pushes to main, and downloads that run and the release’s acceptance', () => {
    const find = runs.join('\n');
    expect(find).toContain(`actions/workflows/${VALIDATION_WORKFLOW.split('/').pop()}/runs?head_sha=$commit&event=push&branch=main&status=success`);
    expect(find).toMatch(/gh run download "\$ID" .* -n "validation-run-\$ID-\$ATTEMPT"/);
    expect(find).toMatch(/gh release download "\$TAG" .* -p acceptance\.json -D acceptance/);
  });

  it('uploads exactly the folder release.js staged, and only after it passed', () => {
    const release = at((s) => /node validation\/release\.js /.test(s.run ?? ''));
    const upload = at((s) => String(s.uses).startsWith('actions/upload-pages-artifact@'));
    expect(release).toBeGreaterThanOrEqual(0);
    expect(upload).toBeGreaterThan(release);
    const command = String(steps[release].run);
    expect(command).toMatch(/--acceptance acceptance\/acceptance\.json/);
    expect(command).toMatch(/--tag-commit "\$COMMIT"/);
    expect(command.match(/--out (\S+)/)?.[1]).toBe(steps[upload].with.path);
    expect(steps.slice(release + 1, upload).every((s) => s.uses && !s.run)).toBe(true);
  });

  it('deploys only the release job’s upload, to the protected Pages environment', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['release', 'deploy']);
    expect(workflow.jobs.deploy.needs).toBe('release');
    expect(workflow.jobs.deploy.environment.name).toBe('github-pages');
    expect(workflow.jobs.deploy.steps.map((/** @type {any} */ s) => s.uses)).toEqual(['actions/deploy-pages@v4']);
  });
});
