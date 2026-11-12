// @ts-check
import { describe, expect, it } from 'vitest';
import { mergeBaseline } from './baseline.js';
/** @typedef {import('./baseline.js').Baseline} Baseline */
import { parseIssueBody, sha256 } from './criteria.js';
import { parseTitle } from './results.js';

/**
 * @param {string} acceptance
 */
const body = (acceptance, qc = '- [] User Tests') =>
  `## Summary\n\nText.\n\n## Acceptance criteria\n\n${acceptance}\n\n## QC approach\n\n${qc}\n`;

describe('acceptance-section parser', () => {
  it('returns the Scope section, which decides how the criteria read, or an empty one', () => {
    const scoped = `## Scope\n\n**In:** the default tile has no flag bar.  \n\n**Out:** the portfolio.\n\n${body('- **11.01** No flag counts.')}`;
    expect(parseIssueBody(11, scoped).scopeSection).toBe('**In:** the default tile has no flag bar.\n\n**Out:** the portfolio.');
    expect(parseIssueBody(11, body('- **11.01** No flag counts.')).scopeSection).toBe('');
  });

  it('reads numbered criteria', () => {
    const parsed = parseIssueBody(14, body('- **14.01** With one study off-cycle, it is excluded.\n- **14.02** Totals add up.'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.criteria).toEqual([
      { id: '14.01', text: 'With one study off-cycle, it is excluded.' },
      { id: '14.02', text: 'Totals add up.' },
]);
  });

  it('rejects prose or bullets without an ID, so no requirement hides in the section', () => {
    const parsed = parseIssueBody(14, body('With a fixture that has one study off-cycle:\n- **14.01** It is excluded.\n- totals add up.'));
    expect(parsed.errors).toHaveLength(2);
  });

  it('rejects duplicate IDs and IDs from another issue', () => {
    const errors = parseIssueBody(9, body('- **9.01** A.\n- **9.01** B.\n- **8.02** C.')).errors.join('\n');
    expect(errors).toMatch(/duplicate ID 9\.01/);
    expect(errors).toMatch(/8\.02 does not belong/);
  });

  it('requires a visual criterion when User Tests is ticked', () => {
    expect(parseIssueBody(10, body('- **10.01** Renders.', '- [x] User Tests (visual comparison)')).errors.join()).toMatch(/User Tests is ticked/);
    expect(parseIssueBody(10, body('- **10.01** Renders.\n- **10.02** A reviewer accepts it (visual comparison).', '- [x] User Tests')).errors).toEqual([]);
  });

  it('reports a missing acceptance section', () => {
    expect(parseIssueBody(3, '## Summary\n\nNothing.').errors.join()).toMatch(/no "## Acceptance criteria" section/);
  });
});

describe('baseline merge', () => {
  /** @type {Baseline} */
  const previous = {
    repo: 'o/r',
    hash: '',
    issues: [{ number: 1, title: 't', parent: null, userTest: false, criteria: [
      { id: '1.01', text: 'Same.', sha256: sha256('Same.'), kind: 'unit', reviewed: true },
      { id: '1.02', text: 'Old.', sha256: sha256('Old.'), kind: 'e2e', modes: ['file'], reason: 'file only', reviewed: true },
] }],
  };
  const merged = mergeBaseline(previous, [{
    number: 1, title: 't', parent: null,
    parsed: { userTest: false, errors: [], scopeSection: '', criteria: [{ id: '1.01', text: 'Same.' }, { id: '1.02', text: 'New.' }, { id: '1.03', text: 'Added.' }] },
  }])[0].criteria;

  it('keeps reviewed metadata when the text is unchanged', () => {
    expect(merged[0]).toMatchObject({ kind: 'unit', reviewed: true });
  });

  it('keeps metadata but requires review again when the text changed', () => {
    expect(merged[1]).toMatchObject({ kind: 'e2e', modes: ['file'], reason: 'file only', reviewed: false, sha256: sha256('New.') });
  });

  it('brings new criteria in unclassified', () => {
    expect(merged[2]).toMatchObject({ kind: null, reviewed: false });
  });
});

describe('test titles', () => {
  it('reads a traced title', () => {
    expect(parseTitle('10.03: summing lives in one function (#10)')).toEqual({ criterion: '10.03', error: null });
  });

  it('leaves a plain title untraced', () => {
    expect(parseTitle('sorts by score')).toEqual({ criterion: null, error: null });
  });

  it('rejects half-traced titles', () => {
    expect(parseTitle('10.03: no issue reference').error).toMatch(/without a trailing/);
    expect(parseTitle('covers the widget (#10)').error).toMatch(/without a criterion prefix/);
  });
});
