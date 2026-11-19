// @ts-check
import { describe, expect, it } from 'vitest';
/** @typedef {import('./gate.js').GateResult} GateResult */
import { RELEASE_BRANCH, SITE, VALIDATION_WORKFLOW, packageProblems } from './package-check.js';
import { SHIPPED } from '../../e2e/projects.js';
/** @typedef {import('./package-check.js').PackageInput} PackageInput */
import { REQUIRED_STEPS } from './record.js';
/** @typedef {import('./record.js').RunRecord} RunRecord */

const SHOT = 'a'.repeat(64);
const SHOT2 = 'b'.repeat(64);
const PAGE = '9'.repeat(64);

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
      evidence: [{ artifact: SHIPPED, mode: 'file', path: 'e.png', sha256: SHOT, test: 't', file: 'f' }, { artifact: SHIPPED, mode: 'subpath', path: 'e2.png', sha256: SHOT2, test: 't', file: 'f' }] }],
    failures: [], incomplete: false, untraced: 0, inScope: 1,
  };
  return {
    run, gate, conclusion: 'success', tagCommit: run.commit, actionsCommit: run.commit, actionsWorkflow: VALIDATION_WORKFLOW, actionsEvent: 'push', actionsBranch: RELEASE_BRANCH, repo: run.repo,
    manifest: [{ path: 'e.png', sha256: SHOT, kind: 'evidence' }, { path: 'e2.png', sha256: SHOT2, kind: 'evidence' }, { path: `${SITE}portfolio.html`, sha256: PAGE, kind: 'build' }],
    actualHashes: new Map([['e.png', SHOT], ['e2.png', SHOT2], [`${SITE}portfolio.html`, PAGE]]),
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

  it('rejects a run with no acceptance at all, or acceptance recorded against another baseline', () => {
    expect(packageProblems({ ...clean(), acceptance: [] }).join('\n')).toMatch(/1\.03: acceptance does not cover/);
    const p = clean();
    p.acceptance = p.acceptance.map((a) => ({ ...a, baselineHash: 'a'.repeat(64) }));
    expect(packageProblems(p).join('\n')).toMatch(/1\.03: acceptance does not cover/);
  });

  it('rejects an Actions run that checked out another commit, came from another workflow, or a run from another repository', () => {
    expect(packageProblems({ ...clean(), actionsCommit: 'd'.repeat(40) }).join('\n')).toMatch(/Actions run checked out d{12}, not the tag commit/);
    expect(packageProblems({ ...clean(), actionsWorkflow: '.github/workflows/other.yml' }).join('\n')).toMatch(/came from \.github\/workflows\/other\.yml/);
    expect(packageProblems({ ...clean(), repo: 'someone/else' }).join('\n')).toMatch(/the run is from o\/r, not someone\/else/);
  });

  it('rejects an Actions run that was dispatched, came from a pull request, or was pushed to another branch', () => {
    for (const [actionsEvent, actionsBranch] of [['workflow_dispatch', 'feature'], ['workflow_dispatch', RELEASE_BRANCH], ['pull_request', 'feature'], ['push', 'feature']]) {
      expect(packageProblems({ ...clean(), actionsEvent, actionsBranch }).join('\n'), `${actionsEvent} on ${actionsBranch}`).toMatch(
        new RegExp(`triggered by ${actionsEvent} on ${actionsBranch}, not by a push to ${RELEASE_BRANCH}`),
      );
    }
  });

  it('rejects a run that built no portfolio report to publish', () => {
    const p = clean();
    p.manifest = p.manifest.filter((r) => r.kind !== 'build');
    expect(packageProblems(p).join('\n')).toMatch(/built no build\/reports\/portfolio\.html/);
  });

  it('rejects a changed or missing evidence file', () => {
    expect(packageProblems({ ...clean(), actualHashes: new Map([['e.png', 'f'.repeat(64)], ['e2.png', SHOT2]]) }).join('\n')).toMatch(/hash mismatch/);
    expect(packageProblems({ ...clean(), actualHashes: new Map() }).join('\n')).toMatch(/manifest file missing/);
  });
});
