// @ts-check
import { describe, expect, it } from 'vitest';
/** @typedef {import('./gate.js').GateResult} GateResult */
import { packageProblems } from './package-check.js';
/** @typedef {import('./package-check.js').PackageInput} PackageInput */
import { REQUIRED_STEPS } from './record.js';
/** @typedef {import('./record.js').RunRecord} RunRecord */

const SHOT = 'a'.repeat(64);
const SHOT2 = 'b'.repeat(64);

/**
 * @returns {PackageInput}
 */
function clean() {
  /** @type {RunRecord} */
  const run = {
    runId: 'gh-1-1', commit: 'c'.repeat(40), repo: 'o/r', startedAt: 't', baselineHash: 'b'.repeat(64),
    scope: { issues: [1], completed: [], pr: null, prCloses: [], stack: [], cli: [] }, issueStates: {}, dataSha256: null, builds: {},
    environment: { os: 'Linux 6', arch: 'x64', node: 'v26.0.0', npm: '11.0.0', packages: {}, browser: { name: 'chromium', version: '158.0' }, lockfileSha256: 'e'.repeat(64) },
    steps: REQUIRED_STEPS.map((name) => ({ name, exitCode: 0, startedAt: 't', endedAt: 't' })),
    validation: 'passed', failures: [], warnings: [],
  };
  /** @type {GateResult} */
  const gate = {
    criteria: [{ id: '1.03', issue: 1, text: 'x (visual check)', kind: 'visual', inScope: true, automated: 'pass', acceptance: 'awaiting', modes: ['file', 'subpath'], tests: [], notes: [],
      evidence: [{ artifact: 'spa', mode: 'file', path: 'e.png', sha256: SHOT, test: 't', file: 'f' }, { artifact: 'spa', mode: 'subpath', path: 'e2.png', sha256: SHOT2, test: 't', file: 'f' }] }],
    failures: [], incomplete: false, untraced: 0, inScope: 1,
  };
  return {
    run, gate, conclusion: 'success', tagCommit: run.commit,
    manifest: [{ path: 'e.png', sha256: SHOT, kind: 'evidence' }, { path: 'e2.png', sha256: SHOT2, kind: 'evidence' }],
    actualHashes: new Map([['e.png', SHOT], ['e2.png', SHOT2]]),
    acceptance: [SHOT, SHOT2].map((screenshotSha256) => ({ runId: run.runId, criterion: '1.03', screenshotSha256, baselineHash: run.baselineHash })),
  };
}

describe('release packaging', () => {
  it('accepts a successful, complete, accepted run on the tag commit', () => {
    expect(packageProblems(clean())).toEqual([]);
  });

  it('rejects a run whose Actions conclusion was not success', () => {
    expect(packageProblems({ ...clean(), conclusion: 'failure' }).join('\n')).toMatch(/concluded "failure"/);
  });

  it('rejects a run whose own record says failed or incomplete', () => {
    for (const validation of /** @type {const} */ (['failed', 'incomplete'])) {
      const p = clean();
      p.run.validation = validation;
      expect(packageProblems(p).join('\n')).toMatch(new RegExp(`validation is "${validation}"`));
    }
  });

  it('rejects a run with a missing, skipped or failed step', () => {
    const p = clean();
    p.run.steps = p.run.steps.filter((s) => s.name !== 'playwright');
    const step = (/** @type {string} */ name) => {
      const found = p.run.steps.find((s) => s.name === name);
      if (!found) throw new Error(`no step ${name}`);
      return found;
    };
    step('vitest').exitCode = 1;
    step('inventory').skipped = true;
    const problems = packageProblems(p).join('\n');
    expect(problems).toMatch(/"playwright" is missing/);
    expect(problems).toMatch(/"vitest" did not succeed/);
    expect(problems).toMatch(/"inventory" did not succeed/);
  });

  it('rejects acceptance recorded against a different run', () => {
    const p = clean();
    p.acceptance = p.acceptance.map((a) => ({ ...a, runId: 'gh-1-2' }));
    expect(packageProblems(p).join('\n')).toMatch(/1\.03: acceptance does not cover/);
  });

  it('rejects acceptance that covers only one delivery mode', () => {
    const p = clean();
    p.acceptance = p.acceptance.slice(0, 1);
    expect(packageProblems(p).join('\n')).toMatch(/1\.03: acceptance does not cover .*file, subpath/);
  });

  it('rejects a run that does not record its execution environment', () => {
    const p = clean();
    p.run.environment = null;
    expect(packageProblems(p).join('\n')).toMatch(/does not record the execution environment/);
  });

  it('rejects a run built from a different commit than the tag', () => {
    expect(packageProblems({ ...clean(), tagCommit: 'd'.repeat(40) }).join('\n')).toMatch(/not the tag commit/);
  });

  it('rejects a changed or missing evidence file', () => {
    expect(packageProblems({ ...clean(), actualHashes: new Map([['e.png', 'f'.repeat(64)], ['e2.png', SHOT2]]) }).join('\n')).toMatch(/hash mismatch/);
    expect(packageProblems({ ...clean(), actualHashes: new Map() }).join('\n')).toMatch(/manifest file missing/);
  });
});
