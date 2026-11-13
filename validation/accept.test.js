// @ts-check
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHIPPED } from '../e2e/projects.js';
import { sha256 } from './lib/criteria.js';

const SCRIPT = join(import.meta.dirname, 'accept.js');
let run;

/** A run folder with one visual criterion and a screenshot of the shipped artifact per mode. */
beforeEach(() => {
  run = mkdtempSync(join(tmpdir(), 'accept-test-'));
  mkdirSync(join(run, 'shots'));
  const shots = { file: 'shots/file.png', subpath: 'shots/subpath.png' };
  for (const [mode, path] of Object.entries(shots)) writeFileSync(join(run, path), `png ${mode}`);
  writeFileSync(join(run, 'run.json'), JSON.stringify({ runId: 'gh-1-1', commit: 'c'.repeat(40), baselineHash: 'b'.repeat(64), validation: 'passed' }));
  const evidence = Object.entries(shots).map(([mode, path]) => ({ artifact: SHIPPED, mode, path, sha256: sha256(`png ${mode}`), test: 't', file: 'f' }));
  const criterion = { id: '1.03', issue: 1, text: 'A reviewer accepts it (visual comparison).', kind: 'visual', inScope: true, automated: 'pass', acceptance: 'awaiting', modes: ['file', 'subpath'], tests: [], notes: [], evidence };
  writeFileSync(join(run, 'matrix.json'), JSON.stringify({ criteria: [criterion], failures: [], incomplete: false, untraced: 0, inScope: 1 }));
});

afterEach(() => rmSync(run, { recursive: true, force: true }));

const accept = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [SCRIPT, run, ...args], { encoding: 'utf8' });
const records = () => JSON.parse(readFileSync(join(run, 'acceptance.json'), 'utf8'));

describe('accept.js', () => {
  it('lists the screenshots to compare and records nothing without --accept', () => {
    const out = accept('1.03');
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain(join(run, 'shots/file.png'));
    expect(out.stdout).toContain(join(run, 'shots/subpath.png'));
    expect(existsSync(join(run, 'acceptance.json'))).toBe(false);
  });

  it('refuses --accept without a reviewer', () => {
    const out = accept('1.03', '--accept');
    expect(out.status).toBe(2);
    expect(existsSync(join(run, 'acceptance.json'))).toBe(false);
  });

  it('records one acceptance per screenshot with the reviewer, and accepting again keeps one record each', () => {
    expect(accept('1.03', '--accept', '--reviewer', 'A Reviewer').status).toBe(0);
    expect(records().map((/** @type {any} */ r) => [r.runId, r.criterion, r.screenshotSha256, r.baselineHash, r.reviewer])).toEqual([
      ['gh-1-1', '1.03', sha256('png file'), 'b'.repeat(64), 'A Reviewer'],
      ['gh-1-1', '1.03', sha256('png subpath'), 'b'.repeat(64), 'A Reviewer'],
    ]);
    expect(accept('1.03', '--accept', '--reviewer', 'A Reviewer').status).toBe(0);
    expect(records()).toHaveLength(2);
  });

  it('records nothing when a screenshot changed after the run, or a criterion cannot be accepted', () => {
    writeFileSync(join(run, 'shots/subpath.png'), 'edited');
    const changed = accept('1.03', '--accept', '--reviewer', 'A Reviewer');
    expect(changed.status).toBe(1);
    expect(changed.stderr).toContain('shots/subpath.png has changed since the run');
    expect(accept('1.03,9.99', '--accept', '--reviewer', 'A Reviewer').status).toBe(1);
    expect(existsSync(join(run, 'acceptance.json'))).toBe(false);
  });
});
