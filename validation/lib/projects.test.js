// @ts-check
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { parseProject, projectName, requireRunDir, SPEC_ARTIFACTS, targetedProjects } from '../../e2e/projects.js';

describe('browser projects', () => {
  it('round-trips artifact and mode through the project name and rejects anything else', () => {
    expect(parseProject(projectName('reports', 'subpath'))).toEqual({ artifact: 'reports', mode: 'subpath' });
    for (const name of ['file', 'subpath', 'spa-file', 'spa-subpath', 'reports', 'reports-other', undefined]) expect(parseProject(name), String(name)).toBeNull();
  });

  it('targets each mode of every artifact some spec lists, and nothing else', () => {
    expect(targetedProjects({ 'e2e/a.spec.js': ['reports'] })).toEqual([{ artifact: 'reports', mode: 'file' }, { artifact: 'reports', mode: 'subpath' }]);
    expect(targetedProjects({ 'e2e/a.spec.js': [] })).toEqual([]);
  });

  it('declares the artifacts of every spec file', () => {
    const specs = readdirSync('e2e').filter((f) => f.endsWith('.spec.js')).map((f) => `e2e/${f}`);
    expect(Object.keys(SPEC_ARTIFACTS).sort()).toEqual(specs.sort());
  });
});

describe('fresh builds only', () => {
  it('has no default run folder', () => {
    expect(() => requireRunDir({})).toThrow(/VALIDATION_RUN_DIR is not set/);
    expect(requireRunDir({ VALIDATION_RUN_DIR: 'validation-runs/x' })).toBe('validation-runs/x');
  });

  it('refuses to load the Playwright configuration without a run folder', () => {
    const env = { ...process.env };
    delete env.VALIDATION_RUN_DIR;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./playwright.config.js')"], { env, encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/VALIDATION_RUN_DIR is not set/);
  });
});
