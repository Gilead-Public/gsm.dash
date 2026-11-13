// @ts-check
import { describe, expect, it } from 'vitest';
import { hashIssues } from './baseline.js';
/** @typedef {import('./baseline.js').Baseline} Baseline */
/** @typedef {import('./baseline.js').Criterion} Criterion */
import { sha256 } from './criteria.js';
import { evaluate } from './gate.js';
import { SHIPPED } from '../../e2e/projects.js';
import { groupFailures } from './matrix.js';
/** @typedef {import('./gate.js').GateInput} GateInput */
/** @typedef {import('./results.js').ResultRow} ResultRow */
/** @typedef {import('./results.js').TestRow} TestRow */

/**
 * @param {string} id
 * @param {Criterion['kind']} kind
 * @param {string} text
 * @param {Partial<Criterion>} [extra]
 * @returns {Criterion}
 */
const crit = (id, kind, text, extra = {}) =>
  ({ id, text, sha256: sha256(text), kind, reviewed: true, ...extra });

/**
 * @param {Criterion[]} criteria
 * @returns {Baseline}
 */
function baselineOf(criteria) {
  const issues = [{ number: 1, title: 'one', parent: null, userTest: false, criteria }];
  return { repo: 'o/r', hash: hashIssues(issues), issues };
}

const unit = crit('1.01', 'unit', 'Totals add up.');
const e2e = crit('1.02', 'e2e', 'The widget renders.');
const visual = crit('1.03', 'visual', 'A reviewer accepts it (visual comparison).');

/**
 * @param {string} title
 * @param {Partial<ResultRow>} [over]
 * @returns {ResultRow}
 */
const row = (title, over = {}) =>
  ({ source: 'vitest', file: 'test/a.test.js', titlePath: [title], artifact: null, mode: null, outcome: 'passed', attachments: [], ...over });
/**
 * @param {string} title
 * @param {'file' | 'subpath'} mode
 * @param {Partial<ResultRow>} [over]
 * @returns {ResultRow}
 */
const pw = (title, mode, over = {}) =>
  row(title, { source: 'playwright', file: 'e2e/a.spec.js', artifact: SHIPPED, mode, ...over });
/**
 * @param {string} mode
 */
const shot = (mode) => ({ name: 'evidence', path: `/run/${mode}.png` });

/**
 * @returns {ResultRow[]}
 */
function cleanRows() {
  return [
    row('1.01: totals add up (#1)'),
    pw('1.02: renders (#1)', 'file', { attachments: [shot('file-e2e')] }),
    pw('1.02: renders (#1)', 'subpath', { attachments: [shot('subpath-e2e')] }),
    pw('1.03: looks right (#1)', 'file', { attachments: [shot('file')] }),
    pw('1.03: looks right (#1)', 'subpath', { attachments: [shot('subpath')] }),
];
}

/**
 * @param {ResultRow[]} rows
 * @returns {TestRow[]}
 */
const inventoryOf = (rows) => rows.map(({ source, file, titlePath, artifact, mode }) => ({ source, file, titlePath, artifact, mode }));

/**
 * @param {Partial<GateInput>} [over={}]
 * @returns {GateInput}
 */
function input(over = {}, rows = cleanRows()) {
  const vitest = rows.filter((r) => r.source === 'vitest');
  const playwright = rows.filter((r) => r.source === 'playwright');
  return {
    baseline: baselineOf([unit, e2e, visual]),
    scope: new Set([1]),
    modes: ['file', 'subpath'],
    artifacts: { 'e2e/a.spec.js': [SHIPPED] },
    reports: { vitest: { rows: vitest, errors: [] }, playwright: { rows: playwright, errors: [] } },
    inventory: inventoryOf(rows),
    evidence: new Map([['/run/file.png', 'a'.repeat(64)], ['/run/subpath.png', 'b'.repeat(64)], ['/run/file-e2e.png', 'c'.repeat(64)], ['/run/subpath-e2e.png', 'd'.repeat(64)]]),
    runId: 'r1',
    ...over,
  };
}

/**
 * @param {GateInput} i
 * @param {RegExp} pattern
 */
const failsWith = (i, pattern) => {
  const result = evaluate(i);
  expect(result.failures.join('\n')).toMatch(pattern);
};

describe('gate', () => {
  it('passes a clean, fully covered run', () => {
    const result = evaluate(input());
    expect(result.failures).toEqual([]);
    expect(result.criteria.map((c) => c.automated)).toEqual(['pass', 'pass', 'pass']);
    expect(result.inScope).toBe(3);
  });

  it('reports out-of-scope criteria as pending and counts zero in scope', () => {
    const result = evaluate(input({ scope: new Set() }, []));
    expect(result.inScope).toBe(0);
    expect(result.criteria.every((c) => c.automated === 'pending')).toBe(true);
  });

  it('fails missing coverage for an in-scope criterion', () => {
    failsWith(input({}, cleanRows().filter((r) => !r.titlePath[0].startsWith('1.01'))), /1\.01: no test/);
  });

  it('fails when the prefix and the issue reference disagree', () => {
    failsWith(input({}, [...cleanRows(), row('1.01: totals add up (#2)')]), /disagree/);
  });

  it('fails a stray issue-like reference such as a hex colour', () => {
    failsWith(input({}, [...cleanRows(), row('1.01: uses colour #4e79a7 (#1)')]), /stray # reference/);
  });

  it('fails a test naming a criterion that is not in the baseline', () => {
    failsWith(input({}, [...cleanRows(), row('1.09: something (#1)')]), /1\.09, which is not in the baseline/);
  });

  it('fails a passed visual criterion with no screenshot', () => {
    const rows = cleanRows().map((r) => (r.mode === 'subpath' && r.titlePath[0].startsWith('1.03') ? { ...r, attachments: [] } : r));
    failsWith(input({}, rows), new RegExp(`1\\.03: no screenshot in ${SHIPPED}/subpath`));
  });

  it('fails a passed e2e criterion with no screenshot in a mode', () => {
    const rows = cleanRows().map((r) => (r.mode === 'file' && r.titlePath[0].startsWith('1.02') ? { ...r, attachments: [] } : r));
    failsWith(input({}, rows), new RegExp(`1\\.02: no screenshot in ${SHIPPED}/file`));
  });

  it('does not let one passing test mask a failing one', () => {
    const result = evaluate(input({}, [...cleanRows(), row('1.01: a second check (#1)', { outcome: 'failed' })]));
    expect(result.criteria.find((c) => c.id === '1.01')?.automated).toBe('fail');
  });

  it('treats a skipped test as not passing', () => {
    const rows = cleanRows().map((r) => (r.titlePath[0].startsWith('1.01') ? { ...r, outcome: /** @type {'skipped'} */ ('skipped') } : r));
    failsWith(input({}, rows), /1\.01: skipped/);
  });

  it('fails an e2e criterion that passed in only one delivery mode', () => {
    failsWith(input({}, cleanRows().filter((r) => !(r.titlePath[0].startsWith('1.02') && r.mode === 'subpath'))), new RegExp(`1\\.02: no passing result in ${SHIPPED}/subpath`));
  });

  it('fails and marks incomplete when a delivery mode produced no results at all', () => {
    const result = evaluate(input({}, cleanRows().filter((r) => r.mode !== 'subpath')));
    expect(result.incomplete).toBe(true);
    expect(result.failures.join('\n')).toMatch(new RegExp(`${SHIPPED}/subpath produced no results`));
  });

  it('fails and marks incomplete when a report is missing', () => {
    const result = evaluate(input({ reports: { vitest: null, playwright: input().reports.playwright } }));
    expect(result.incomplete).toBe(true);
    expect(result.failures.join('\n')).toMatch(/vitest report is missing/);
  });

  it('fails a listed test that produced no result', () => {
    const i = input();
    i.inventory = [...(i.inventory ?? []), { source: 'vitest', file: 'test/a.test.js', titlePath: ['never ran'], artifact: null, mode: null }];
    failsWith(i, /no result for listed test/);
  });

  it('fails and marks incomplete when the inventory is missing', () => {
    const result = evaluate(input({ inventory: null }));
    expect(result.incomplete).toBe(true);
  });

  it('fails an unclassified or unreviewed in-scope criterion', () => {
    failsWith(input({ baseline: baselineOf([crit('1.01', null, 'Totals add up.'), e2e, visual]) }), /1\.01: not classified/);
    failsWith(input({ baseline: baselineOf([crit('1.01', 'unit', 'Totals add up.', { reviewed: false }), e2e, visual]) }), /1\.01: classification not reviewed/);
  });

  it('marks a criterion unapproved, not failed, when its tests pass but its kind is not approved, and still fails the run', () => {
    const result = evaluate(input({ baseline: baselineOf([crit('1.01', 'unit', 'Totals add up.', { reviewed: false }), e2e, visual]) }));
    expect(result.criteria.find((c) => c.id === '1.01')?.automated).toBe('unapproved');
    expect(result.failures).toEqual(['1.01: classification not reviewed']);
  });

  it('marks an unclassified criterion with passing tests unapproved rather than failing it on modes it does not have yet', () => {
    const result = evaluate(input({ baseline: baselineOf([crit('1.01', null, 'Totals add up.'), e2e, visual]) }));
    expect(result.criteria.find((c) => c.id === '1.01')?.automated).toBe('unapproved');
  });

  it('a failing test still reads as fail when the kind is also unapproved', () => {
    const rows = [...cleanRows(), row('1.01: a second check (#1)', { outcome: 'failed' })];
    const result = evaluate(input({ baseline: baselineOf([crit('1.01', 'unit', 'Totals add up.', { reviewed: false }), e2e, visual]) }, rows));
    expect(result.criteria.find((c) => c.id === '1.01')?.automated).toBe('fail');
  });

  it('fails a kind that disagrees with the issue text about visual review', () => {
    failsWith(input({ baseline: baselineOf([unit, crit('1.02', 'visual', 'The widget renders.'), visual]) }), /1\.02: kind "visual" disagrees/);
  });

  it('fails a report error such as a test file that did not load', () => {
    const i = input();
    i.reports.vitest = { rows: i.reports.vitest?.rows ?? [], errors: ['vitest: test/x.test.js failed to run'] };
    failsWith(i, /failed to run/);
  });

  it('counts untraced tests without failing them', () => {
    const result = evaluate(input({}, [...cleanRows(), row('a plain unit test')]));
    expect(result.failures).toEqual([]);
    expect(result.untraced).toBe(1);
  });

  it('marks acceptance only when records from this run and baseline cover the screenshots of every mode', () => {
    const base = input();
    const record = { runId: 'r1', criterion: '1.03', screenshotSha256: 'a'.repeat(64), baselineHash: base.baseline.hash };
    const both = [record, { ...record, screenshotSha256: 'b'.repeat(64) }];
    expect(evaluate({ ...base, acceptance: both }).criteria.find((c) => c.id === '1.03')?.acceptance).toBe('accepted');
    expect(evaluate({ ...base, acceptance: [record] }).criteria.find((c) => c.id === '1.03')?.acceptance, 'file mode only').toBe('awaiting');
    expect(evaluate({ ...base, acceptance: [{ ...record, runId: 'r0' }] }).criteria.find((c) => c.id === '1.03')?.acceptance).toBe('awaiting');
    expect(evaluate({ ...base, acceptance: [{ ...record, screenshotSha256: 'c'.repeat(64) }] }).criteria.find((c) => c.id === '1.03')?.acceptance).toBe('awaiting');
  });
});

describe('artifacts', () => {
  // An artifact that doesn't ship, run alongside the one that does.
  const other = /** @type {import('../../e2e/projects.js').Artifact} */ (/** @type {unknown} */ ('other'));
  const both = { 'e2e/a.spec.js': [SHIPPED, other] };
  /** @returns {ResultRow[]} */
  const otherRows = () =>
    cleanRows()
      .filter((r) => r.source === 'playwright')
      .map((r) => ({ ...r, artifact: other, attachments: r.attachments.map((a) => ({ ...a, path: a.path.replace('/run/', '/run/other-') })) }));
  /**
   * @param {ResultRow[]} rows
   */
  const withOtherShots = (rows) => {
    const i = input({ artifacts: both }, rows);
    for (const [path, hash] of [...i.evidence]) i.evidence.set(path.replace('/run/', '/run/other-'), hash.replace(/./g, 'e'));
    return i;
  };

  it('passes when every targeted artifact passes in every mode with a screenshot', () => {
    expect(evaluate(withOtherShots([...cleanRows(), ...otherRows()])).failures).toEqual([]);
  });

  it('fails a criterion whose spec targets an artifact that did not pass in one mode', () => {
    const rows = [...cleanRows(), ...otherRows().filter((r) => !(r.titlePath[0].startsWith('1.02') && r.mode === 'subpath'))];
    failsWith(withOtherShots(rows), new RegExp(`1\\.02: no passing result in ${other}/subpath`));
  });

  it('fails a targeted artifact with no screenshot in a mode', () => {
    const rows = [...cleanRows(), ...otherRows().map((r) => (r.mode === 'file' && r.titlePath[0].startsWith('1.02') ? { ...r, attachments: [] } : r))];
    failsWith(withOtherShots(rows), new RegExp(`1\\.02: no screenshot in ${other}/file`));
  });

  it('fails and marks incomplete when a declared artifact produced no results at all', () => {
    const result = evaluate(input({ artifacts: both }));
    expect(result.incomplete).toBe(true);
    expect(result.failures.join('\n')).toMatch(new RegExp(`${other}/file produced no results`));
  });

  it('fails a browser test from a spec that declares no artifacts', () => {
    failsWith(input({}, [...cleanRows(), pw('an untraced check', 'file', { file: 'e2e/b.spec.js' })]), /e2e\/b\.spec\.js declares no artifacts/);
  });

  it('never accepts a visual criterion on screenshots of an artifact that does not ship', () => {
    const i = withOtherShots([...cleanRows(), ...otherRows()]);
    const record = { runId: 'r1', criterion: '1.03', baselineHash: i.baseline.hash };
    const unshipped = [{ ...record, screenshotSha256: 'e'.repeat(64) }];
    const shipped = [{ ...record, screenshotSha256: 'a'.repeat(64) }, { ...record, screenshotSha256: 'b'.repeat(64) }];
    expect(evaluate({ ...i, acceptance: unshipped }).criteria.find((c) => c.id === '1.03')?.acceptance).toBe('awaiting');
    expect(evaluate({ ...i, acceptance: shipped }).criteria.find((c) => c.id === '1.03')?.acceptance).toBe('accepted');
  });
});

describe('failure display', () => {
  it('collapses approval failures into one line and keeps the rest', () => {
    const shown = groupFailures(['8.01: classification not reviewed', '8.02: not classified', '10.02: failed [file] 10.02: x (#10)', 'step "scope" exited 1']);
    expect(shown).toEqual([
      '2 criteria await classification approval (their tests are judged separately): 8.01, 8.02',
      '10.02: failed [file] 10.02: x (#10)',
      'step "scope" exited 1',
]);
  });
});
