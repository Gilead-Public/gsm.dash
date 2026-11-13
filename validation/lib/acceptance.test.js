// @ts-check
import { describe, expect, it } from 'vitest';
import { SHIPPED } from '../../e2e/projects.js';
import { acceptanceRecords, acceptanceTargets, mergeRecords } from './acceptance.js';
import { acceptedInEveryMode } from './gate.js';
/** @typedef {import('./gate.js').CriterionStatus} CriterionStatus */

/** An artifact that doesn't ship. */
const other = /** @type {import('../../e2e/projects.js').Artifact} */ (/** @type {unknown} */ ('other'));
const hash = (/** @type {string} */ c) => c.repeat(64);

/**
 * A passing, in-scope visual criterion with a screenshot per mode on both artifacts.
 * @param {Partial<CriterionStatus>} [over]
 * @returns {CriterionStatus}
 */
const visual = (over = {}) => ({
  id: '1.03', issue: 1, text: 'A reviewer accepts it (visual comparison).', kind: 'visual', inScope: true, automated: 'pass', acceptance: 'awaiting',
  modes: ['file', 'subpath'], tests: [], notes: [],
  evidence: [
    { artifact: SHIPPED, mode: 'file', path: 'shots/file.png', sha256: hash('a'), test: 't', file: 'f' },
    { artifact: SHIPPED, mode: 'subpath', path: 'shots/subpath.png', sha256: hash('b'), test: 't', file: 'f' },
    { artifact: other, mode: 'file', path: 'shots/other-file.png', sha256: hash('c'), test: 't', file: 'f' },
    { artifact: other, mode: 'subpath', path: 'shots/other-subpath.png', sha256: hash('d'), test: 't', file: 'f' },
  ],
  ...over,
});

/** The run folder as it was written: every evidence file with its recorded hash. */
const asRun = (/** @type {CriterionStatus[]} */ criteria) => {
  const files = new Map(criteria.flatMap((c) => c.evidence.map((e) => [e.path, e.sha256])));
  return (/** @type {string} */ path) => files.get(path) ?? null;
};

describe('acceptance targets', () => {
  it("lists only the shipped artifact's screenshots, one per required mode", () => {
    const criteria = [visual()];
    const [t] = acceptanceTargets(criteria, ['1.03'], asRun(criteria));
    expect(t.problems).toEqual([]);
    expect(t.shots.map((s) => [s.mode, s.path])).toEqual([['file', 'shots/file.png'], ['subpath', 'shots/subpath.png']]);
  });

  it('refuses a criterion that is unknown, not visual, out of scope or not passing', () => {
    const criteria = [visual({ id: '1.01', kind: 'e2e' }), visual({ id: '1.02', inScope: false }), visual({ id: '1.04', automated: 'fail' })];
    const problems = acceptanceTargets(criteria, ['1.01', '1.02', '1.04', '9.99'], asRun(criteria)).map((t) => t.problems.join('; '));
    expect(problems).toEqual([
      '1.01: a e2e criterion, not a visual one',
      "1.02: not in this run's scope",
      '1.04: its tests did not pass in this run (fail)',
      "9.99: not in this run's matrix",
    ]);
  });

  it('refuses a mode with no screenshot of the shipped artifact, even when the other artifact has one', () => {
    const c = visual();
    c.evidence = c.evidence.filter((e) => !(e.artifact === SHIPPED && e.mode === 'subpath'));
    const [t] = acceptanceTargets([c], ['1.03'], asRun([c]));
    expect(t.problems).toEqual([`1.03: no ${SHIPPED} screenshot in subpath mode`]);
  });

  it('refuses a screenshot that is missing or has changed since the run', () => {
    const criteria = [visual()];
    const now = (/** @type {string} */ path) => (path === 'shots/file.png' ? hash('e') : null);
    expect(acceptanceTargets(criteria, ['1.03'], now)[0].problems).toEqual([
      '1.03: shots/file.png has changed since the run',
      '1.03: shots/subpath.png is missing',
    ]);
  });
});

describe('acceptance records', () => {
  const by = { runId: 'r1', baselineHash: hash('9'), reviewer: 'A Reviewer', acceptedAt: '2026-11-13T00:00:00.000Z' };

  it("cover every mode of the criterion, as the gate reads them, and only for this run's baseline", () => {
    const c = visual();
    const records = acceptanceRecords(acceptanceTargets([c], ['1.03'], asRun([c])), by);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.reviewer === 'A Reviewer' && r.acceptedAt === by.acceptedAt)).toBe(true);
    expect(acceptedInEveryMode(c, records, 'r1', by.baselineHash)).toBe(true);
    expect(acceptedInEveryMode(c, records, 'r2', by.baselineHash)).toBe(false);
    expect(acceptedInEveryMode(c, records, 'r1', hash('8'))).toBe(false);
  });

  it('merge without duplicates, a later acceptance replacing an earlier one of the same screenshot', () => {
    const c = visual();
    const first = acceptanceRecords(acceptanceTargets([c], ['1.03'], asRun([c])), by);
    const again = acceptanceRecords(acceptanceTargets([c], ['1.03'], asRun([c])), { ...by, reviewer: 'B Reviewer' });
    const merged = mergeRecords(first, again);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.reviewer)).toEqual(['B Reviewer', 'B Reviewer']);
    const otherCriterion = acceptanceRecords([{ id: '1.05', text: '', problems: [], shots: [{ mode: 'file', path: 'x.png', sha256: hash('f'), test: 't' }] }], by);
    expect(mergeRecords(merged, otherCriterion)).toHaveLength(3);
  });
});
