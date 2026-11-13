// @ts-check
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHIPPED } from '../../e2e/projects.js';
import { acceptanceRecords, acceptanceTargets } from './acceptance.js';
import { sha256 } from './criteria.js';
import { RELEASE_BRANCH, SITE, VALIDATION_WORKFLOW, packageProblems } from './package-check.js';
import { REQUIRED_STEPS } from './record.js';
import { REDIRECT, ciRun, readRun, stageSite } from './release.js';
/** @typedef {import('./gate.js').AcceptanceRecord} AcceptanceRecord */

const COMMIT = 'c'.repeat(40);
const REPO = 'o/r';
let tmp;
let dir;

/** @param {string} path @param {string} body */
const put = (path, body) => {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), body);
  return { path, sha256: sha256(body) };
};

/** A qualifying CI run folder: two reports, a screenshot per mode of one visual criterion, and its records. */
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'release-test-'));
  dir = join(tmp, 'gh-42-1');
  const reports = ['portfolio.html', 'STUDY001.html', 'more/note.txt'].map((f) => ({ ...put(`${SITE}${f}`, `<p>${f}</p>`), kind: 'build' }));
  put(`${SITE}stray.html`, 'not in the manifest');
  const shots = /** @type {const} */ (['file', 'subpath']).map((mode) => ({ mode, ...put(`shots/${mode}.png`, `png ${mode}`) }));
  const evidence = shots.map((s) => ({ artifact: SHIPPED, mode: s.mode, path: s.path, sha256: s.sha256, test: 't', file: 'f' }));
  const criterion = { id: '1.03', issue: 1, text: 'x (visual comparison)', kind: 'visual', inScope: true, automated: 'pass', acceptance: 'awaiting', modes: ['file', 'subpath'], tests: [], notes: [], evidence };
  put('matrix.json', JSON.stringify({ criteria: [criterion], failures: [], incomplete: false, untraced: 0, inScope: 1 }));
  put('run.json', JSON.stringify({
    runId: 'gh-42-1', commit: COMMIT, repo: REPO, startedAt: 't', baselineHash: 'b'.repeat(64), scope: {}, issueStates: {}, dataSha256: null, builds: {},
    environment: { os: 'Linux', arch: 'x64', node: 'v26', npm: '11', packages: {}, browser: { name: 'chromium', version: '1' }, lockfileSha256: 'e'.repeat(64) },
    steps: REQUIRED_STEPS.map((name) => ({ name, exitCode: 0, startedAt: 't', endedAt: 't' })), validation: 'passed', failures: [], warnings: [],
  }));
  const manifest = [...reports, ...shots.map((s) => ({ path: s.path, sha256: s.sha256, kind: 'evidence' }))];
  writeFileSync(join(dir, 'manifest.jsonl'), manifest.map((r) => JSON.stringify(r)).join('\n') + '\n');
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

/** The reviewer's acceptance of this run, as validation/accept.js writes it. */
const accepted = () => {
  const { run, gate } = readRun(dir);
  const targets = acceptanceTargets(gate.criteria, ['1.03'], (path) => sha256(readFileSync(join(dir, path), 'utf8')));
  return acceptanceRecords(targets, { runId: run.runId, baselineHash: run.baselineHash, reviewer: 'A Reviewer', acceptedAt: 't' });
};

/**
 * What the release gate says about the folder as it is now, for a push to main unless `actions` says otherwise.
 * @param {AcceptanceRecord[]} acceptance
 * @param {{ actionsEvent?: string, actionsBranch?: string }} [actions]
 */
const problems = (acceptance, actions = {}) => {
  const { run, gate, manifest, actualHashes } = readRun(dir);
  return packageProblems({
    run, gate, manifest, actualHashes, acceptance, tagCommit: COMMIT, repo: REPO,
    conclusion: 'success', actionsCommit: COMMIT, actionsWorkflow: VALIDATION_WORKFLOW, actionsEvent: 'push', actionsBranch: RELEASE_BRANCH, ...actions,
  }).join('\n');
};

describe('the release gate on a run folder', () => {
  it('passes a qualifying run that the reviewer accepted', () => {
    expect(problems(accepted())).toBe('');
  });

  it('blocks a missing acceptance, one from another run, and one against another baseline', () => {
    expect(problems([])).toMatch(/1\.03: acceptance does not cover/);
    expect(problems(accepted().map((a) => ({ ...a, runId: 'gh-41-1' })))).toMatch(/1\.03: acceptance does not cover/);
    expect(problems(accepted().map((a) => ({ ...a, baselineHash: 'a'.repeat(64) })))).toMatch(/1\.03: acceptance does not cover/);
  });

  it('blocks a screenshot or report changed after the run', () => {
    const acceptance = accepted();
    writeFileSync(join(dir, 'shots/file.png'), 'edited');
    expect(problems(acceptance)).toMatch(/hash mismatch: shots\/file\.png/);
    writeFileSync(join(dir, `${SITE}STUDY001.html`), 'edited');
    expect(problems(acceptance)).toMatch(/hash mismatch: build\/reports\/STUDY001\.html/);
  });

  it('blocks an otherwise qualifying run that was dispatched on, or pushed to, a branch other than main', () => {
    expect(problems(accepted(), { actionsEvent: 'workflow_dispatch', actionsBranch: 'feature' })).toMatch(/triggered by workflow_dispatch on feature/);
    expect(problems(accepted(), { actionsEvent: 'workflow_dispatch', actionsBranch: RELEASE_BRANCH })).toMatch(/triggered by workflow_dispatch on main/);
    expect(problems(accepted(), { actionsEvent: 'push', actionsBranch: 'feature' })).toMatch(/triggered by push on feature/);
    expect(problems(accepted(), { actionsEvent: 'push', actionsBranch: RELEASE_BRANCH })).toBe('');
  });

  it('blocks a failed or incomplete run', () => {
    for (const validation of ['failed', 'incomplete']) {
      const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ ...run, validation }));
      expect(problems(accepted())).toMatch(new RegExp(`validation is "${validation}"`));
    }
  });

  it('gives no hash to a manifest path outside the run folder, so it counts as missing', () => {
    writeFileSync(join(tmp, 'outside.html'), 'x');
    writeFileSync(join(dir, 'manifest.jsonl'), `${readFileSync(join(dir, 'manifest.jsonl'), 'utf8')}${JSON.stringify({ path: '../outside.html', sha256: sha256('x'), kind: 'build' })}\n`);
    expect(readRun(dir).actualHashes.has('../outside.html')).toBe(false);
    expect(problems(accepted())).toMatch(/manifest file missing: \.\.\/outside\.html/);
  });
});

describe('staging a release', () => {
  it("copies exactly the run's listed reports, byte for byte, with a redirect to the portfolio", () => {
    const out = join(tmp, 'site');
    expect(stageSite(dir, readRun(dir).manifest, out)).toEqual(['portfolio.html', 'STUDY001.html', 'more/note.txt']);
    expect(readdirSync(out, { recursive: true }).map(String).sort()).toEqual(['STUDY001.html', 'index.html', 'more', join('more', 'note.txt'), 'portfolio.html']);
    expect(readFileSync(join(out, 'portfolio.html'), 'utf8')).toBe('<p>portfolio.html</p>');
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe(REDIRECT);
    expect(REDIRECT).toContain('url=./portfolio.html');
  });

  it('refuses a folder that already exists, and a report that no longer matches its hash', () => {
    const out = join(tmp, 'site');
    mkdirSync(out);
    expect(() => stageSite(dir, readRun(dir).manifest, out)).toThrow(/already exists/);
    const { manifest } = readRun(dir);
    writeFileSync(join(dir, `${SITE}STUDY001.html`), 'edited');
    expect(() => stageSite(dir, manifest, join(tmp, 'site2'))).toThrow(/does not match its manifest hash/);
  });

  it('refuses a listed path that would land outside the staging folder, before copying anything', () => {
    const { manifest } = readRun(dir);
    const out = join(tmp, 'site');
    const escape = { path: `${SITE}../../escaped.html`, sha256: sha256('x'), kind: /** @type {const} */ ('build') };
    expect(() => stageSite(dir, [...manifest, escape], out)).toThrow(/would be staged outside/);
    expect(readdirSync(tmp).sort()).toEqual(['gh-42-1']);
  });

  it('knows a CI run by its id, and a local run has none', () => {
    expect(ciRun('gh-43449864194-2')).toEqual({ id: '43449864194', attempt: '2' });
    for (const local of ['20261113T181055-18df5c5', 'xgh-1-2', 'gh-1-2-3', 'gh-1']) expect(ciRun(local), local).toBeNull();
  });
});
