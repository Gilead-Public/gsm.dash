// @ts-check
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { sha256 } from './lib/criteria.js';
import { SITE } from './lib/package-check.js';
import { shareReadme, shareRun } from './lib/share.js';

const SCRIPT = join(import.meta.dirname, 'share.js');
let tmp;
let dir;

/** @param {object} [over] Fields of run.json to change. */
const writeRun = (over = {}) =>
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'gh-42-1', commit: 'c'.repeat(40), scope: { pr: 31 }, validation: 'passed', ...over }));

/** A run folder with two reports, one stray file the manifest doesn't list, and a passing record. */
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'share-test-'));
  dir = join(tmp, 'gh-42-1');
  mkdirSync(join(dir, SITE), { recursive: true });
  const rows = ['portfolio.html', 'STUDY001.html'].map((f) => {
    writeFileSync(join(dir, SITE, f), `<p>${f}</p>`);
    return { path: `${SITE}${f}`, sha256: sha256(`<p>${f}</p>`), kind: 'build' };
  });
  writeFileSync(join(dir, SITE, 'stray.html'), 'not tested');
  writeFileSync(join(dir, 'manifest.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(dir, 'matrix.json'), JSON.stringify({ criteria: [] }));
  writeRun();
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('sharing a run', () => {
  it("copies the run's tested reports with a read-me naming the run, its PR and commit", () => {
    const out = join(tmp, 'share');
    expect(shareRun(dir, out)).toEqual(['portfolio.html', 'STUDY001.html']);
    expect(readdirSync(out).sort()).toEqual(['README.txt', 'STUDY001.html', 'index.html', 'portfolio.html']);
    expect(readFileSync(join(out, 'portfolio.html'), 'utf8')).toBe('<p>portfolio.html</p>');
    const readme = readFileSync(join(out, 'README.txt'), 'utf8');
    expect(readme).toContain('validation run gh-42-1 (gsm.dash PR #31) on commit cccccccccccc');
    expect(readme).toMatch(/simulated example data/);
    expect(readme).toMatch(/not a reviewed release/);
  });

  it('names no PR for a run outside one', () => {
    expect(shareReadme(/** @type {any} */ ({ runId: 'gh-1-1', commit: 'd'.repeat(40), scope: { pr: null } }))).toContain('run gh-1-1 on commit dddddddddddd');
  });

  it('shares nothing from a run that failed or is incomplete, or whose report changed after it', () => {
    for (const validation of ['failed', 'incomplete']) {
      writeRun({ validation });
      const out = spawnSync(process.execPath, [SCRIPT, dir, '--out', join(tmp, validation)], { encoding: 'utf8' });
      expect(out.status).toBe(1);
      expect(out.stderr).toMatch(new RegExp(`did not pass validation \\(${validation}\\)`));
      expect(existsSync(join(tmp, validation))).toBe(false);
    }
    writeRun();
    writeFileSync(join(dir, SITE, 'STUDY001.html'), 'edited');
    expect(() => shareRun(dir, join(tmp, 'edited'))).toThrow(/does not match its manifest hash/);
  });
});

describe('the validation workflow', () => {
  /** @type {any[]} */
  const steps = parse(readFileSync(join(import.meta.dirname, '../.github/workflows/validation.yml'), 'utf8')).jobs.validate.steps;
  const share = steps.findIndex((s) => /node validation\/share\.js /.test(s.run ?? ''));
  const upload = steps.findIndex((s) => String(s.with?.name).startsWith('gsm-dash-reports-'));

  it('shares the reports only after a passing run, and uploads exactly what it staged', () => {
    expect(share).toBeGreaterThan(steps.findIndex((s) => s.run === 'node validation/run.js'));
    expect(upload).toBe(share + 1);
    for (const s of [steps[share], steps[upload]]) expect(s.if).toBeUndefined();
    const out = String(steps[share].run.match(/--out (\S+)/)?.[1]);
    expect(steps[share].run).toContain('"validation-runs/gh-${{ github.run_id }}-${{ github.run_attempt }}"');
    expect(`${String(steps[upload].with.path).replace(/\/$/, '')}/gsm-dash-reports`).toBe(out);
  });
});
