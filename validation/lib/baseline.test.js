// @ts-check
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { baselineProblems, differsFromLive, loadBaseline, readBaseline, syncIssues, writeBaseline } from './baseline.js';
/** @typedef {import('./baseline.js').Baseline} Baseline */
/** @typedef {import('./baseline.js').IssueSource} IssueSource */
import { sha256 } from './criteria.js';
import { resolveScope } from './scope.js';

const tmp = mkdtempSync(join(tmpdir(), 'baseline-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/**
 * @param {number} number
 * @param {string[]} texts
 */
const issue = (number, texts) => ({
  number, title: `issue ${number}`, parent: null, userTest: false,
  criteria: texts.map((text, i) => ({ id: `${number}.${String(i + 1).padStart(2, '0')}`, text, sha256: sha256(text), kind: /** @type {'unit'} */ ('unit'), reviewed: true })),
});

/**
 * @returns {string}
 */
function saved() {
  const path = join(tmp, `b-${Math.random().toString(36).slice(2)}.json`);
  writeBaseline({ repo: 'o/r', issues: [issue(8, ['A.', 'B.']), issue(9, ['C.'])] }, path);
  return path;
}

describe('baseline integrity', () => {
  it('a baseline written by the tools verifies', () => {
    expect(loadBaseline(saved()).problems).toEqual([]);
  });

  it('a hand-edited reviewed flag breaks the baseline hash', () => {
    const path = saved();
    const raw = /** @type {Baseline} */ (JSON.parse(readFileSync(path, 'utf8')));
    raw.issues[0].criteria[0].reviewed = false;
    writeFileSync(path, JSON.stringify(raw));
    expect(loadBaseline(path).problems.join('\n')).toMatch(/baseline hash does not match/);
    expect(() => readBaseline(path)).toThrow(/failed verification/);
  });

  it('a hand-edited criterion text breaks its own hash', () => {
    const path = saved();
    const raw = /** @type {Baseline} */ (JSON.parse(readFileSync(path, 'utf8')));
    raw.issues[0].criteria[1].text = 'Changed.';
    expect(baselineProblems(raw).join('\n')).toMatch(/8\.02: stored hash does not match its text/);
  });
});

describe('scoped sync', () => {
  const previous = readBaseline(saved());
  /** @type {IssueSource} */
  const source = { number: 8, title: 'issue 8', parent: null, parsed: { userTest: false, errors: [], scopeSection: '', criteria: [{ id: '8.01', text: 'A.' }] } };

  it('keeps every issue outside the scope untouched', () => {
    const issues = syncIssues(previous, [source], { scoped: true });
    expect(issues.map((i) => i.number).sort()).toEqual([8, 9]);
    expect(issues.find((i) => i.number === 9)).toEqual(previous.issues.find((i) => i.number === 9));
    expect(issues.find((i) => i.number === 8)?.criteria.map((c) => c.id)).toEqual(['8.01']);
  });

  it('a full sync keeps only the issues it found', () => {
    expect(syncIssues(previous, [source], { scoped: false }).map((i) => i.number)).toEqual([8]);
  });
});

describe('a Scope edit', () => {
  /**
   * @param {number} number
   * @param {string} scopeSection
   * @returns {IssueSource}
   */
  const live = (number, scopeSection) => ({
    number, title: `issue ${number}`, parent: null,
    parsed: { userTest: false, errors: [], scopeSection, criteria: [{ id: `${number}.01`, text: number === 8 ? 'A.' : 'C.' }] },
  });
  const recorded = () => readBaseline(saved());
  const reviewed = (/** @type {import('./baseline.js').BaselineIssue[]} */ issues, /** @type {number} */ n) =>
    issues.find((i) => i.number === n)?.criteria.map((c) => c.reviewed);

  it('a baseline written before Scope was recorded keeps its reviews on the first sync, and records the Scope', () => {
    const issues = syncIssues(recorded(), [live(8, 'No flag bar.')], { scoped: true });
    expect(reviewed(issues, 8)).toEqual([true]);
    expect(issues.find((i) => i.number === 8)?.scopeSection).toBe('No flag bar.');
  });

  it("reopens every review of that issue, and only that issue's, even when no criterion text changed", () => {
    const first = { repo: 'o/r', hash: '', issues: syncIssues(recorded(), [live(8, 'No flag bar.'), live(9, 'Other.')], { scoped: false }) };
    const edited = syncIssues(first, [live(8, 'A flag bar.'), live(9, 'Other.')], { scoped: false });
    expect(reviewed(edited, 8)).toEqual([false]);
    expect(reviewed(edited, 9)).toEqual([true]);
    expect(reviewed(syncIssues(first, [live(8, 'No flag bar.')], { scoped: true }), 8)).toEqual([true]);
  });

  it('counts as drift from GitHub until it is synced', () => {
    const [issue] = syncIssues(null, [live(8, 'No flag bar.')], { scoped: false });
    expect(differsFromLive(issue, live(8, 'No flag bar.').parsed)).toBe(false);
    expect(differsFromLive(issue, live(8, 'A flag bar.').parsed)).toBe(true);
    expect(differsFromLive({ ...issue, scopeSection: undefined }, live(8, 'No flag bar.').parsed)).toBe(true);
  });
});

describe('scope', () => {
  const known = new Set([8, 9, 10]);

  it('fails a PR that closes an issue with no criteria in the baseline', () => {
    const { issues, failures } = resolveScope({ known, completed: [], prCloses: [10, 31], cli: [] });
    expect(failures.join('\n')).toMatch(/closes #31, which has no criteria/);
    expect(issues).toEqual([10]);
  });

  it('fails --issues naming an issue outside the baseline', () => {
    expect(resolveScope({ known, completed: [], prCloses: [], cli: [40] }).failures.join()).toMatch(/#40/);
  });

  it('unions completed issues, PR closing references and --issues', () => {
    expect(resolveScope({ known, completed: [8], prCloses: [10], cli: [9] })).toEqual({ issues: [8, 9, 10], failures: [] });
  });
});
