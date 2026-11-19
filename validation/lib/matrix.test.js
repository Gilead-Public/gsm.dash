// @ts-check
import { describe, expect, it } from 'vitest';
import { matrixHtml, matrixMarkdown, requirementRollup } from './matrix.js';
/** @typedef {import('./baseline.js').BaselineIssue} BaselineIssue */
/** @typedef {import('./gate.js').CriterionStatus} CriterionStatus */
/** @typedef {import('./gate.js').GateResult} GateResult */
/** @typedef {import('./record.js').RunRecord} RunRecord */

/**
 * @param {number} number
 * @param {string | null} parent
 * @returns {BaselineIssue}
 */
const issue = (number, parent) => ({ number, title: `Issue <${number}> | title`, parent, userTest: false, criteria: [] });

/**
 * @param {string} id
 * @param {Partial<CriterionStatus>} [extra]
 * @returns {CriterionStatus}
 */
const status = (id, extra = {}) => ({
  id, issue: Number(id.split('.')[0]), text: `text ${id}`, kind: 'unit', inScope: true, automated: 'pass', acceptance: 'not required',
  modes: [], tests: [], evidence: [], notes: [], ...extra,
});

/**
 * @param {CriterionStatus[]} criteria
 * @returns {GateResult}
 */
const gateOf = (criteria) => /** @type {GateResult} */ ({ criteria, failures: [], incomplete: false, untraced: 0, inScope: criteria.filter((c) => c.inScope).length });

const run = /** @type {RunRecord} */ (/** @type {unknown} */ ({
  runId: 'r1', commit: 'abcdef0123456789', baselineHash: '0123456789abcdef', startedAt: '2026-01-01T00:00:00.000Z', validation: 'passed',
  failures: [], warnings: [], scope: { issues: [1, 2], stack: [] },
}));

const issues = [issue(3, null), issue(1, 'o/roadmap#10'), issue(4, 'o/roadmap#20'), issue(2, 'o/roadmap#10'), issue(5, 'o/roadmap#20')];
const gate = gateOf([
  status('1.01'),
  status('1.02', { automated: 'fail' }),
  status('1.03', { kind: 'visual', acceptance: 'awaiting' }),
  status('2.01', { automated: 'missing' }),
  status('2.02', { automated: 'unapproved' }),
  status('3.01'),
  status('4.01', { inScope: false, automated: 'pending' }),
  status('4.02', { inScope: false, automated: 'pending', kind: 'visual', acceptance: 'awaiting' }),
]);

describe('requirementRollup', () => {
  it('groups issues under their parent in baseline order, with parentless issues last', () => {
    const rollup = requirementRollup(issues, gate);
    expect(rollup.map((g) => [g.parent, g.issues.map((i) => i.number)])).toEqual([
      ['o/roadmap#10', [1, 2]],
      ['o/roadmap#20', [4, 5]],
      [null, [3]],
    ]);
  });

  it("counts each issue's criteria by automated status", () => {
    const [first] = requirementRollup(issues, gate);
    expect(first.issues[0]).toMatchObject({ criteria: 3, inScope: true, counts: { pass: 2, fail: 1, missing: 0, unapproved: 0, pending: 0 } });
    expect(first.issues[1]).toMatchObject({ criteria: 2, counts: { pass: 0, fail: 0, missing: 1, unapproved: 1, pending: 0 } });
  });

  it('counts visual criteria awaiting acceptance only when they are in scope', () => {
    const byNumber = new Map(requirementRollup(issues, gate).flatMap((g) => g.issues).map((i) => [i.number, i]));
    expect(byNumber.get(1)?.awaiting).toBe(1);
    expect(byNumber.get(4)).toMatchObject({ inScope: false, awaiting: 0, counts: { pending: 2 } });
  });

  it('keeps an issue with no criteria as a row of zeros', () => {
    const row = requirementRollup(issues, gate)[1].issues[1];
    expect(row).toMatchObject({ number: 5, criteria: 0, inScope: false, awaiting: 0, counts: { pass: 0, fail: 0, missing: 0, unapproved: 0, pending: 0 } });
  });
});

describe('the matrix documents', () => {
  it('put the roll-up before the criteria in markdown, with table pipes escaped', () => {
    const md = matrixMarkdown(run, gate, issues);
    expect(md.indexOf('## Requirements')).toBeGreaterThan(-1);
    expect(md.indexOf('## Requirements')).toBeLessThan(md.indexOf('## Criteria'));
    expect(md).toContain('### o/roadmap#10');
    expect(md).toContain('### No parent requirement');
    expect(md).toContain('| #1 Issue <1> \\| title | yes | 3 | 2 | 1 | 0 | 0 | 0 | 1 |');
    expect(md).toContain('| #4 Issue <4> \\| title | no | 2 | 0 | 0 | 0 | 0 | 2 | 0 |');
  });

  it('put the roll-up before the criteria in HTML, with titles escaped', () => {
    const html = matrixHtml(run, gate, issues);
    expect(html.indexOf('<h2>Requirements</h2>')).toBeGreaterThan(-1);
    expect(html.indexOf('<h2>Requirements</h2>')).toBeLessThan(html.indexOf('<h2>Criteria</h2>'));
    expect(html).toContain('<h3>o/roadmap#10</h3>');
    expect(html).toContain('<td>#1 Issue &lt;1&gt; | title</td><td>yes</td><td>3</td><td>2</td><td>1</td>');
  });

  it('leave the roll-up out when no issues are given', () => {
    expect(matrixMarkdown(run, gate)).not.toContain('## Requirements');
    expect(matrixHtml(run, gate)).not.toContain('Requirements');
  });
});
